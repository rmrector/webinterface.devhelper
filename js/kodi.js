'use strict'

const TIMEOUT = 60000

// Kodi doesn't like requests > 1024 bytes
let LIMIT_WEBSOCKET = 1024

const jskodi = {}

jskodi.imageencode = image_url =>
	image_url.startswith('image://') ? image_url : 'image://' + encodeURIComponent(image_url) + '/'
jskodi.imagedecode = image_url =>
	image_url.startswith('image://') ? decodeURIComponent(image_url.slice(8, -1)) : image_url

/**
 * A connection to Kodi's websocket port
 * @param {string|URL} host
 * @param {Object} websocket_options
 * @param {string} websocket_options.base Websocket server reverse proxy path
 * @param {string} websocket_options.port
 * @param {string} websocket_options.secure
 * @constructor
 */
jskodi.Connection = class {
	constructor(host, {base='', port='9090', secure=false}={}) {
		toolbox.EventEmitter(this)
		if (typeof host === 'string')
			host = new URL(host)
		if (host.protocol !== 'http:' && host.protocol !== 'https:')
			throw new Error("Host must be HTTP or HTTPS")
		this.host = host.origin + host.pathname
		if (this.host.endsWith('/'))
			this.host = this.host.slice(0, -1)
		this.wsurl = (secure ? 'wss://' : 'ws://') + host.hostname + ':' + port + base
		this.nextid = 0
		this.openmethods = {}
		this.notifications = {}
		this.methods = {}
		this.reftypes = {}
		this.socket
		this.interval
		this.name
	}
	connected() {
		return this.socket && this.socket.readyState === WebSocket.OPEN
	}
	connect() {
		async function prepare_connection(connection) {
			const data = await connection.call('Application.GetProperties', {properties: ['name', 'version']})
			connection.name = data.name + ' ' + data.version.major + '.' + data.version.minor
			if (data.version.tag !== 'stable') {
				if (data.version.tag === 'releasecandidate')
					connection.name += ' rc' + (data.version.tagversion || '')
				else
					connection.name += ' ' + data.version.tag + (data.version.tagversion || '')
			}

			let name = await connection.call('Settings.GetSettingValue', {setting: 'services.devicename'})
			name = name.value
			if (name === 'Kodi') {
				// FriendlyName appends the hostname if instance name not set
				name = await connection.call('XBMC.GetInfoLabels', {labels: ['System.FriendlyName']})
				name = name['System.FriendlyName']
				if (name.startsWith('Kodi (') && name.endsWith(')'))
					name = name.slice(6, -1)
			}
			connection.name += ' on ' + name
		}
		return new Promise((resolve) => {
			if (this.socket) {
				resolve(this)
				return
			}
			this.emit('statuschange', {connected: false})
			this.socket = new WebSocket(this.wsurl)
			this.socket.onerror = function(error) {
				console.log('connection error', error)
			}
			this.socket.onclose = event => {
				console.log(event.wasClean ? 'Connection close was clean' : 'Connection suddenly closed', event)
				console.log(`close code : ${event.code} reason: ${event.reason}`)
				this.emit('statuschange', {connected: false})
			}
			this.socket.onopen = async () => {
				console.log('connection opened')
				await prepare_connection(this)
				this.emit('statuschange', {connected: true})
				resolve(this)
			}
			this.socket.onmessage = message => {
				if (!message.data) {
					console.log("No message data received")
					console.log(message)
					return
				}
				var data = message.data
				try {
					data = JSON.parse(data)
				} catch (e) {
					console.log("Didn't get valid JSON", data)
					return
				}
				if (!('id' in data)) {
					const desc = this.notifications[data.method] && this.notifications[data.method].description
					this.emit('notification', {data, description: desc})
				} else if (!(data.id in this.openmethods))
					console.log('Unhandled message', data)
			}
			this.interval = setInterval(async () => {
				if (this.connected()) {
					if (document.hidden)
						return
					const t0 = performance.now()
					try {
						await this.ping()
						this.emit('pingtime', {time: (performance.now() - t0).toFixed(1)})
					} catch (e) {
						console.log(e)
						console.log(e.code)
						console.log('ping failed, disconnecting')
						this.disconnect(false)
						await this.connect()
					}
				} else if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
					console.log('no connection, retrying')
					this.disconnect(false)
					resolve(this.connect())
				}
			}, TIMEOUT * 2)
		})
	}
	disconnect(removelisteners=true) {
		if (removelisteners)
			this.resetevents()
		if (!this.socket)
			return
		clearInterval(this.interval)
		this.socket.onclose = null
		this.socket.close()
		this.socket = null
	}
	call(method, params, {id=undefined, logcall=debug.other_jsonrpc, alldata=false}={}) {
		return new Promise((resolve, reject) => {
			if (!this.connected()) {
				reject(this.build_connection_error('no-connection', "Not connected to Kodi"))
				return
			}
			if (id == null)
				id = this.nextid++
			else if (id in this.openmethods) {
				reject(this.build_connection_error('duplicate-open-request'))
				return
			}
			const request = {jsonrpc: '2.0', method, params, id}
			const strequest = JSON.stringify(request)
			if (LIMIT_WEBSOCKET && strequest.length > LIMIT_WEBSOCKET) {
				reject(this.build_connection_error('too-long', "Request is too long for Kodi websocket"))
				// TODO: No CORS, only works on same host
				if (false) resolve(this.http_call(method, params, {id, logcall, alldata}))
				return
			}
			if (logcall)
				console.log('Request', request)
			this.openmethods[id] = {method, params}
			const timeout = setTimeout(() => {
				delete this.openmethods[id]
				this.socket.removeEventListener('message', handlethismessage)
				reject(this.build_connection_error('timeout', `Method call timed out "${method}"`))
			}, TIMEOUT)
			const handlethismessage = event => {
				if (!event.data) return
				try {
					var data = JSON.parse(event.data)
				} catch (e) { return }
				if (data.id !== id) return
				delete this.openmethods[id]
				this.socket.removeEventListener('message', handlethismessage)
				clearTimeout(timeout)
				if (logcall)
					console.log('Result', data)
				if (data.result)
					resolve(alldata ? data : data.result)
				else
					reject((alldata ? data : data.error) || this.build_connection_error('no-result'))
			}
			this.socket.addEventListener('message', handlethismessage)
			this.socket.send(strequest)
		})
	}
	async http_call(method, params, {id=undefined, logcall=debug.other_jsonrpc, alldata=false}={}) {
		if (id == null)
			id = this.nextid++
		const request = {jsonrpc: '2.0', method, params, id}
		if (logcall)
			console.log('Request', request)
		let data = await fetch(this.host + '/jsonrpc', {
			method: 'POST',
			body: JSON.stringify(request),
			headers: { 'Content-Type': 'application/json' }
		}).json()
		if (logcall)
			console.log('Result', data)
		if (data.result)
			return alldata ? data : data.result
		throw (alldata ? data : data.error) || this.build_connection_error('no-result')
	}
	async populatedata() {
		const args = {getmetadata: true}
		const data = await this.call('JSONRPC.Introspect', args)
		if (data.notifications)
			this.notifications = data.notifications
		if (data.types)
			this.reftypes =
				jskodi._jsonrpc.dereference(jskodi._jsonrpc.extend(data.types), data.types)
		if (data.methods)
			this.methods = toolbox.process_object(data.methods, undefined,
				([key, {description}]) => [key, description])
		return data
	}
	async introspect(methodname) {
		if (!methodname)
			throw new Error('methodname is required')
		const args = {getdescriptions: true, getmetadata: true, filterbytransport: false,
			filter: {getreferences: false, id: methodname, type: 'method'}}
		const data = await this.call('JSONRPC.Introspect', args)
		jskodi._jsonrpc.dereference(data.methods[methodname], this.reftypes)
		return data
	}
	async get_infos(infos, booleans=false) {
		if (!infos || !infos.length) return {}
		const method = !booleans ? 'XBMC.GetInfoLabels' : 'XBMC.GetInfoBooleans'
		if (LIMIT_WEBSOCKET) {
			const result = {}
			const listoflists = infos.reduce((result, item) => {
				if (result.length && result[result.length - 1].join('","').length + item.length <
						LIMIT_WEBSOCKET - 100)
					result[result.length - 1].push(item)
				else
					result.push([item])
				return result
			}, [])
			for (const list of listoflists) {
				Object.assign(result, await this.call(method, [list],
					{id: "runningdata", logcall: debug.runningdata}))
			}
			return result
		} else {
			return await this.call(method, [infos],
				{id: "runningdata", logcall: debug.runningdata})
		}
	}
	ping() {
		return this.call('JSONRPC.Ping', undefined, {id: "ping", logcall: debug.ping})
	}
	build_connection_error(code, message) {
		return Object.assign(new Error(message), {code, errmessage: message, '* source': 'web interface'})
	}
}

// TODO: Somehow build the info lists automatically, at least most of them

// INFO: Integer only labels don't work, like "Player.Progress"
// Contaner InfoBooleans 'OnNext', 'OnScrollNext', 'OnScrollPrevious', 'OnPrevious' are triggers for
//  animations and are so short they aren't much use here

// TODO: Missing PVR and game info. weather

jskodi.skinlabels = {}

const pathlistitem_labels = ['FileName', 'Path', 'FolderName', 'FolderPath', 'FileNameAndPath', 'FileExtension', 'Size']
	.map(l => 'ListItem.' + l)
const listitem_bools = ['IsFolder', 'IsPlaying', 'IsResumable', 'IsCollection', 'IsSelected', 'IsStereoscopic',
	'IsParentFolder', 'Property(IsSpecial)', 'Property(Addon.IsEnabled)', 'Property(Addon.IsInstalled)',
	'Property(Addon.HasUpdate)', 'Property(Addon.Orphaned)'].map(l => 'ListItem.' + l)

jskodi.skinlabels.labels = {
	visiblewindows: {title: 'Visible windows', order: 0, special: 'justkey', visible: true,
		filter: ([_, value]) => value, mapper: ([key, v]) => [key.slice(17, -1), v], boollist: []},
	videoart: {title: 'Video art', order: 1, special: 'popupinfo',
		filter: ([_, value]) => value,
		mapper: ([key, value]) => [key, value.includes('/') || value.includes('\\')
			? jskodi.imageencode(value) : value],
		list: []},
	musicart: {title: 'Music art', order: 1.5, special: 'popupinfo',
		filter: ([_, value]) => value,
		mapper: ([key, value]) => [key, value.includes('/') || value.includes('\\')
			? jskodi.imageencode(value) : value],
		list: []},
	player: {title: 'Player InfoLabels', order: 9,
		list: ['Time', 'FinishTime', 'TimeRemaining', 'Duration', 'SeekTime', 'SeekStepSize', 'PlaySpeed',
			'StartTime', 'Title', 'TimeSpeed', 'Chapter', 'ChapterCount', 'ChapterName', 'Volume',
			'SubtitleDelay', 'AudioDelay', 'SeekOffset']
			.map(l => 'Player.' + l).concat(['PlaylistPosition', 'PlaylistLength', 'LastPlayed',
				'PlayCount', 'AudioLanguage', 'SubtitlesLanguage'].map(l => 'VideoPlayer.' + l))
			.concat(['PlaylistPosition', 'PlaylistLength'].map(l => 'MusicPlayer.' + l))
			.concat(['Random', 'Repeat', 'Length(music)', 'Length(video)', 'Position(music)', 'Position(video)']
			.map(l => 'Playlist.' + l)).sort()},
	videoplayer: {title: 'VideoPlayer InfoLabels', order: 10,
		list: ['TVShowTitle', 'Plot', 'Episode', 'Season', 'Genre', 'Director', 'AudioLanguage',
			'Year', 'Rating', 'MPAA', 'CastAndRole', 'Album', 'Artist', 'Studio', 'Writer', 'Tagline', 'DBID',
			'UserRating', 'PlotOutline', 'SubtitlesLanguage', 'Cast', 'Title'].sort().map(l => 'VideoPlayer.' + l)},
	musicplayer: {title: 'MusicPlayer InfoLabels', order: 11,
		list: ['Album', 'Property(Album_Mood)', 'Property(Album_Style)', 'Property(Album_Theme)', 'Artist',
			'Property(Album_Type)', 'Property(Album_Label)', 'Property(Album_Description)', 'Property(Artist_Born)',
			'Property(Artist_Died)', 'Property(Artist_Formed)', 'Property(Artist_Mood)', 'Property(Artist_Disbanded)',
			'Property(Artist_YearsActive)', 'Property(Artist_Instrument)', 'Genre', 'Property(Artist_Description)',
			'Property(Artist_Style)', 'Property(Artist_Genre)', 'Lyrics', 'Year', 'Rating', 'DiscNumber',
			'Comment', 'TrackNumber', 'Contributors', 'ContributorAndRole', 'Mood', 'Property(Role.Arranger)',
			'Property(Role.Composer)', 'Property(Role.Conductor)', 'Property(Role.DJMixer)', 'Property(Role.Engineer)',
			'Property(Role.Lyricist)', 'Property(Role.Mixer)', 'Property(Role.Orchestra)', 'Property(Role.Producer)',
			'Property(Role.Remixer)', 'UserRating', 'DBID', 'Title', 'Property(Artist_Sortname)',
			'Property(Artist_Type)', 'Property(Artist_Gender)', 'Property(Artist_Disambiguation)']
				.sort().map(l => 'MusicPlayer.' + l)
			.concat(['Visualisation.Preset', 'Visualisation.Name'])},
	playertech: {title: 'Player tech InfoLabels', order: 12,
		list: ['Process(VideoFPS)', 'Process(VideoDAR)', 'Process(AudioChannels)', 'Process(AudioDecoder)',
			'Process(AudioSamplerate)', 'Process(AudioBitsPerSample)', 'Process(PixFormat)', 'Process(DeintMethod)',
			'Process(VideoHeight)', 'Process(VideoDecoder)', 'Process(VideoWidth)'].map(l => 'Player.' + l)
			.concat(['VideoCodec', 'VideoResolution', 'VideoAspect', 'AudioCodec', 'AudioChannels', 'StereoscopicMode']
				.map(l => 'VideoPlayer.' + l))
			.concat(['BitRate', 'Channels', 'BitsPerSample', 'SampleRate', 'Codec'].map(l => 'MusicPlayer.' + l)).sort()},
	listitem: {title: 'ListItem InfoLabels', order: 4,
		list: ['Label', 'Label2', 'Title', 'OriginalTitle', 'SortLetter', 'EndTime', 'Icon', 'ActualIcon',
			'Year', 'Premiered', 'Genre', 'Director', 'Country', 'Episode',
			'Season', 'TVShowTitle', 'Date', 'DateAdded', 'Size', 'Set', 'SetID', 'UserRating', 'Rating',
			'Votes', 'RatingAndVotes', 'MPAA', 'CastAndRole', 'DBID', 'Cast', 'DBTYPE', 'Duration', 'Studio',
			'Top250', 'Trailer', 'Writer', 'Tagline', 'PlotOutline', 'Plot', 'IMDBNumber', 'PercentPlayed',
			'LastPlayed', 'PlayCount', 'VideoCodec', 'VideoResolution', 'VideoAspect', 'AudioCodec',
			'AudioChannels', 'AudioLanguage', 'SubtitleLanguage', 'StereoscopicMode',
			'EndTimeResume', 'Status', 'Tag', 'Appearances', 'Overlay'].sort().map(l => 'ListItem.' + l)},
	musiclistitem: {title: 'Music ListItem InfoLabels', order: 6,
		list: ['Artist', 'Album', 'DiscNumber', 'TrackNumber', 'AlbumArtist', 'Comment', 'Contributors', 'Mood', 'ContributorAndRole', 'Property(Role.Arranger)', 'Property(Role.Composer)', 'Property(Role.Conductor)',
			'Property(Role.DJMixer)', 'Property(Role.Engineer)', 'Property(Role.Lyricist)', 'Property(Role.Mixer)',
			'Property(Role.Orchestra)', 'Property(Role.Producer)', 'Property(Role.Remixer)', 'Property(Artist_Sortname)',
			'Property(Artist_Type)', 'Property(Artist_Gender)', 'Property(Artist_Disambiguation)', 'Property(Artist_Born)',
			'Property(Artist_Died)', 'Property(Artist_Formed)', 'Property(Artist_Mood)', 'Property(Artist_Disbanded)',
			'Property(Artist_YearsActive)', 'Property(Artist_Instrument)', 'Property(Artist_Description)',
			'Property(Artist_Style)', 'Property(Artist_Genre)', 'Lyrics', 'Property(Album_Mood)',
			'Property(Album_Style)', 'Property(Album_Theme)', 'Property(Album_Type)', 'Property(Album_Label)',
			'Property(Album_Description)'].sort().map(l => 'ListItem.' + l)},
	addonlistitem: {title: 'Add-on ListItem InfoLabels', order: 7,
		list: ['AddonBroken', 'AddonCreator', 'AddonDescription', 'AddonDisclaimer', 'AddonInstallDate', 'AddonSize',
			'AddonLastUpdated', 'AddonLastUsed', 'AddonName', 'AddonNews', 'AddonSummary', 'AddonType', 'AddonVersion',
			'Property(Addon.Changelog)', 'Property(Addon.ID)', 'Property(Addon.Path)', 'Property(Addon.Status)']
			.sort().map(l => 'ListItem.' + l)},
	path: {title: 'Path InfoLabels', order: 2,
		list: pathlistitem_labels.concat(pathlistitem_labels.map(l => 'Container.' + l))
			.concat(['Folderpath', 'Filenameandpath', 'Filename'].map(l => 'Player.' + l))
			.concat(['Container.FolderPath', 'Container.FolderName']).sort()},
	system: {title: 'System InfoLabels', order: 3,
		list: ['CPUTemperature', 'CPUUsage', 'GPUTemperature', 'FanSpeed', 'FPS', 'Memory(used)', 'CurrentWindow',
			'Memory(total)', 'Memory(used.percent)', 'HddTemperature', 'Uptime', 'TotalUptime','CpuFrequency',
			'VideoEncoderInfo', 'InternetState', 'OSVersionInfo', 'FreeSpace', 'UsedSpace', 'TotalSpace',
			'UsedSpacePercent', 'FreeSpacePercent', 'BuildDate', 'FriendlyName', 'ScreenMode', 'ScreenWidth',
			'ScreenHeight', 'ScreenResolution', 'Language', 'ProfileName', 'ProfileCount', 'ProfileThumb',
			'CurrentControl', 'CurrentControlID', 'BuildVersion'].map(l => 'System.' + l)
			.concat(['AspectRatio', 'CurrentTheme', 'CurrentColourTheme', 'Font'].map(l => 'Skin.' + l))
			.concat('Window.Property(xmlfile)', 'Weather.Conditions')
			.concat(['IsDHCP', 'IPAddress', 'LinkState', 'MacAddress'].map(l => 'Network.' + l)).sort()},
	container: {title: 'Container InfoLabels', order: 8,
		list: ['Content', 'Viewmode', 'SortMethod', 'SortOrder', 'PluginName', 'PluginCategory', 'ShowPlot',
		'ShowTitle', 'NumPages', 'NumItems', 'CurrentPage', 'CurrentItem', 'Position', 'Column', 'Row',
		'Totaltime', 'TotalWatched', 'TotalUnwatched', 'Property(addoncategory)', 'Property(reponame)',
		'ViewCount', 'NumAllItems', 'NumNonFolderItems'].sort().map(l => 'Container.' + l)},
	bools: {title: 'Other InfoBooleans', order: 16,
		boollist: ['HasThumb', 'HasFiles', 'HasFolders',
			'HasNext', 'HasPrevious', 'IsUpdating', 'IsStacked', 'CanFilter', 'CanFilterAdvanced', 'Filtered',
			'HasParent', 'SortDirection(ascending)', 'SortDirection(descending)', 'Scrolling'].map(l => 'Container.' + l)
			.concat(['IsScanningMusic', 'IsScanningVideo'].map(l => 'Library.' + l))
			.concat('Weather.IsFetched').sort()},
	listitembools: {title: 'ListItem InfoBooleans', order: 13,
		boollist: listitem_bools.concat(listitem_bools.map(l => 'Container.' + l))},
	playerbools: {title: 'Player InfoBooleans', order: 14,
		boollist: ['HasMedia', 'HasAudio', 'HasDuration', 'HasVideo', 'Passthrough', 'Playing', 'Paused', 'Forwarding',
			'Forwarding2x', 'Forwarding4x', 'Forwarding8x', 'Forwarding16x', 'Forwarding32x', 'Rewinding2x',
			'Rewinding', 'Rewinding4x', 'Rewinding8x', 'Rewinding16x', 'Rewinding32x', 'Caching', 'DisplayAfterSeek',
			'Seeking', 'ShowTime', 'ShowInfo', 'IsInternetStream', 'Muted', 'Process(videohwdecoder)', 'TempoEnabled',
			'IsTempo', 'HasGame', 'PauseEnabled', 'SeekEnabled', 'HasResolutions', 'HasPrograms',
			'FrameAdvance'].map(l => 'Player.' + l)
			.concat('MusicPlayer.HasNext', 'MusicPlayer.HasPrevious', 'MusicPartyMode.Enabled')
			.concat(['IsRandom', 'IsRepeat', 'IsRepeatOne'].map(l => 'Playlist.' + l))
			.concat(['UsingOverlays', 'IsFullscreen', 'HasMenu', 'HasInfo', 'HasSubtitles',
				'HasTeletext', 'SubtitlesEnabled', 'Content(movies)', 'Content(episodes)',
				'Content(musicvideos)', 'IsStereoscopic'].map(l => 'VideoPlayer.' + l)).sort()},
	systembools: {title: 'System InfoBooleans', order: 15,
		boollist: ['HasNetwork', 'HasMediadvd', 'IsStandalone', 'IsFullscreen', 'IsLoggedOn', 'HasLoginScreen',
			'HasActiveModalDialog', 'HasVisibleModalDialog', 'Platform.Linux', 'Platform.Linux.RaspberryPi',
			'Platform.Windows', 'Platform.OSX', 'Platform.IOS', 'Platform.Darwin', 'Platform.Android', 'CanPowerDown',
			'CanSuspend', 'CanHibernate', 'HasHiddenInput', 'CanReboot', 'ScreenSaverActive', 'Setting(hidewatched)',
			'IsInhibit', 'HasShutdown', 'Time(00:00, 08:00)', 'Time(08:00, 16:00)', 'Time(16:00, 00:00)']
				.sort().map(l => 'System.' + l)},
	lightsystemlabels: {title: 'Sys Info', order: 97, visible: true,
		list: ['CPUUsage', 'FPS', 'Memory(used)',
			'Memory(used.percent)', 'CpuFrequency', 'ScreenMode',
			'CurrentControl', 'CurrentControlID'].map(l => 'System.' + l)
			.concat('Skin.AspectRatio').sort()},
	customlabels: {title: 'Custom InfoLabels', order: 98, visible: true, list: []},
	custombooleans: {title: 'Custom InfoBooleans', order: 99, visible: true, boollist: []}
}
const _labels = jskodi.skinlabels.labels
_labels.containerlistitem = {title: 'Container.ListItem InfoLabels', order: 5,
	list: _labels.listitem.list.map(l => 'Container.' + l)}
_labels.addonlistitem.list = _labels.addonlistitem.list.map(l => 'Container.' + l)
	.concat(_labels.addonlistitem.list)
_labels.musiclistitem.list = _labels.musiclistitem.list.map(l => 'Container.' + l)
	.concat(_labels.musiclistitem.list)

jskodi.skinlabels.get_categories = () => Object.entries(_labels)

jskodi.skinlabels.set_custominfo = function(labels, booleans) {
	if (labels)
		_labels.customlabels.list = labels.filter(Boolean)
	if (booleans)
		_labels.custombooleans.boollist = booleans.filter(Boolean)
}

jskodi.skinlabels.set_customart = function(videoart, musicart) {
	_labels.videoart.list = videoart
	_labels.musicart.list = musicart
}

jskodi.skinlabels.set_libraryart = async function(artmap) {
	if (!artmap)
		artmap = await jskodi.get_library_arttypes()
	const allart = arttypemap2infolabels(artmap)
	jskodi.skinlabels.set_customart(allart.video, allart.music)
}
jskodi.skinlabels.set_customart_bylist = function(typelist) {
	const result = {}
	for (const type of typelist) {
		const split = type.split('.')
		if (!(split[0] in result))
			result[split[0]] = []
		result[split[0]].push(split[1])
	}
	const allart = arttypemap2infolabels(result)
	jskodi.skinlabels.set_customart(allart.video, allart.music)
}
jskodi.skinlabels.set_visiblewindows = function(windowbools) {
	_labels.visiblewindows.boollist = windowbools
}
jskodi.get_library_arttypes = async function() {
	// In the library, but plugins can provide other artwork types
	const mediatypes = {'movie': 'VideoLibrary.GetMovies', 'tvshow': 'VideoLibrary.GetTVShows',
		'set': 'VideoLibrary.GetMovieSets', 'season': 'VideoLibrary.GetSeasons',
		'musicvideo': 'VideoLibrary.GetMusicVideos', 'artist': 'AudioLibrary.GetArtists',
		'album': 'AudioLibrary.GetAlbums', 'song': 'AudioLibrary.GetSongs',
		'episode': 'VideoLibrary.GetEpisodes'}
	const result = {}
	for (const type in mediatypes) {
		const data = await appdata.connection.call(mediatypes[type],
			{"properties":["art"], "limits": {"end": 2000}, "sort": {"method": "random"}})
		if (!(type + 's' in data))
			continue;
		const lists = data[type + 's'].map(mov => Object.keys(mov.art).filter(val => filterart(val)))
		result[type] = toolbox.uniquelist([].concat(...lists))
	}
	return result
}

function arttypemap2infolabels(typemap) {
	const infosource = ['ListItem', 'Container', 'Container.ListItem', 'Player']
	const result = {
		video: [].concat(...infosource.map(map_infolabel(toolbox.uniquelist(
			[].concat(...['tvshow', 'set', 'season'].map(mapparent(typemap)))
			.concat(...['movie', 'tvshow', 'set', 'season', 'musicvideo', 'episode'].map(t => typemap[t])))
			.sort()))),
		music: [].concat(...infosource.map(map_infolabel(toolbox.uniquelist(
			[].concat(...['album', 'artist', 'song'].map(t => typemap[t]))
			.concat(...['album', 'artist'].map(mapparent(typemap)))
			.concat(...['artist1', 'artist2', 'albumartist', 'albumartist1', 'albumartist2']
				.map(mapparent(typemap, 'artist')))).sort())))
	}
	return result
}
const mapparent = (typemap, forcekey) => parent =>
	typemap[forcekey || parent].map(art => parent + '.' + art)

const map_infolabel = allart => pre =>
	allart.map(art => pre + `.Art(${art})`)

function filterart(arttype, allnumbered=true) {
	if (arttype.includes('.'))
		return false
	if (allnumbered)
		return true
	const match = arttype.match(/[0-9]+$/)
	return match ? parseInt(match[0], 10) < 2 : true
}


jskodi._jsonrpc = {}
/**
 * Dereference JSON-RPC '$ref' introspection details
 */
jskodi._jsonrpc.dereference = (obj, reftypes) => {
	if (Array.isArray(obj)) {
		for (const o of obj) {
			jskodi._jsonrpc.dereference(o, reftypes)
		}
	} else if (obj instanceof Object) {
		Object.values(obj).forEach(o => jskodi._jsonrpc.dereference(o, reftypes))
		if ('$ref' in obj && obj.$ref in reftypes) {
			Object.assign(obj, reftypes[obj.$ref])
			delete obj.$ref
		}
	}
	return obj
}

/**
 * Extend JSON-RPC introspection details
 */
jskodi._jsonrpc.extend = reftypes => {
	let tomerge = []
	function doit(obj) {
		if (Array.isArray(obj)) {
			for (const o of obj) {
				doit(o)
			}
		} else if (obj instanceof Object) {
			Object.values(obj).forEach(o => doit(o))
			if ('extends' in obj) {
				let extends_ = obj.extends
				if (typeof extends_ === 'string')
					extends_ = [extends_]
				extends_ = extends_.map(i => reftypes[i])
				if (extends_.some(i => i.extends)) {
					tomerge.push(obj)
				} else {
					delete obj.extends
					jskodi._jsonrpc.mergeall(obj, extends_)
				}
			}
		}
	}
	doit(reftypes)
	while (tomerge.length) {
		const newmerge = [...tomerge]
		tomerge = []
		doit(newmerge)
	}
	return reftypes
}

jskodi._jsonrpc.mergeall = (first, others) => others.reduce(jskodi._jsonrpc.merge, first)
jskodi._jsonrpc.merge = (obj, nextobj) => {
	// the original properties take preference when they are not mergeable
	if (obj == null || nextobj == null || !(obj instanceof Object || Array.isArray(obj)) ||
			!(nextobj instanceof Object || Array.isArray(nextobj)))
		return obj
	let isarray = Array.isArray(obj)
	if (isarray && isarray === Array.isArray(nextobj)) {
		return [...obj, ...nextobj]
	} else if(!isarray) {
		Object.keys(nextobj).forEach(function(newkey) {
			obj[newkey] = obj[newkey] ? jskodi._jsonrpc.merge(obj[newkey], nextobj[newkey]) : nextobj[newkey]
		})
	}
	return obj
}
