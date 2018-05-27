'use strict'

// TODO: preview more information on item in notifications. OnPlay preview could include basic info like
//  media title, season/episode numbers, artist/album/TV show
// TODO: ctrl+click InfoLabels and Booleans to add to custom list

// TODO: Switch to turn ListItem InfoLabels into Container.ListItem, maybe a few switches to only check classes
//  of artwork (Player/ListItem/Container/Container.ListItem)
// ListItem infos could also have a switch for Container

// TODO: Include more script windows from add-ons
// Window.Property(xmlfile) will have a full path to the window file if it's not in the current skin,
//  loaded from the add-on instead

// TODO: maybe easier to grok media listings would be helpful

// TODO: Window.IsActive at the top of Visible Windows with a different style
//  Will double the size of the JSON-RPC request

const hashman = {handle_hashchange: function() {
	let hash = window.location.hash
	if (!hash || !hash.startsWith('#/'))
		return
	const [action, querystring] = hash.slice(2).splitc('?', 1)
	const params = {}
	querystring && querystring.split('&').forEach(p => {
		const [key, value] = p.splitc('=', 1)
		params[key] = decodeURIComponent(value.replace(/\+/g, '%20') || '')
	})
	appdata.setaction(action, params)
}, set: function(action, params, silent=false) {
	let newhash = '#/'
	if (action) newhash += action
	if (params && Object.keys(params).length) {
		newhash += '?' + Object.entries(params).map(e => e[0] + '=' + encodeURIComponent(String(e[1]))).join('&')
	}
	if (silent)
		window.history.pushState(undefined, '', newhash)
	else
		window.location.hash = newhash
}}
window.addEventListener("hashchange", hashman.handle_hashchange)

// TODO: Somehow build the info lists automatically, at least most of them

// INFO: Integer labels don't work, like "Player.Progress"
// Contaner InfoBooleans 'OnNext', 'OnScrollNext', 'OnScrollPrevious', 'OnPrevious' are triggers for
//  animations and are so short they aren't much use here

const pathlistitem_labels = ['FileName', 'Path', 'FolderName', 'FolderPath', 'FileNameAndPath', 'FileExtension', 'Size']
	.map(l => 'ListItem.' + l)
const listitem_bools = ['IsFolder', 'IsPlaying', 'IsResumable', 'IsCollection', 'IsSelected', 'IsStereoscopic',
	'IsParentFolder', 'Property(IsSpecial)', 'Property(Addon.IsEnabled)', 'Property(Addon.IsInstalled)',
	'Property(Addon.HasUpdate)', 'Property(Addon.Orphaned)'].map(l => 'ListItem.' + l)

// INFO: 'icon' isn't set for add-ons and programs and such, have to use ListItem.Icon
const videoarttypes = ['poster', 'fanart', 'banner', 'landscape', 'clearart', 'clearlogo', 'characterart',
	'discart', 'thumb', 'icon', 'fanart1', 'fanart2', 'screenshot']
const artistarttypes = ['fanart', 'fanart1', 'fanart2', 'banner', 'landscape', 'clearart', 'clearlogo', 'thumb']
// 'fanart' is fallback from artist, 'poster' is the album cover/thumb for music videos
const albumarttypes = ['thumb', 'discart', 'back', 'spine', 'fanart', 'poster']
const basemusicarttypes = Array.from(new Set(artistarttypes.concat(albumarttypes)))
const videoartworktypes = videoarttypes.concat(videoarttypes.map(t => 'tvshow.' + t))
	.concat(videoarttypes.map(t => 'season.' + t)).concat(videoarttypes.map(t => 'set.' + t))
const musicartworktypes = basemusicarttypes.concat(artistarttypes.map(t => 'artist.' + t))
	.concat(artistarttypes.map(t => 'artist1.' + t)).concat(albumarttypes.map(t => 'album.' + t))
	.concat(artistarttypes.map(t => 'albumartist.' + t)).concat(artistarttypes.map(t => 'albumartist1.' + t))

const skinlabels = {
	visiblewindows: {title: 'Visible windows', order: 0, special: 'justkey', visible: true,
		filter: ([_, value]) => value, mapper: ([key, v]) => [key.slice(17, -1), v], boollist: []},
	videoart: {title: 'Video art', order: 1, special: 'popupinfo',
		filter: ([_, value]) => value,
		mapper: ([key, value]) => [key, value.includes('/') | value.includes('\\')
			? toolbox.imageencode(value) : value],
		list: videoartworktypes.map(art => `ListItem.Art(${art})`)
			.concat(videoartworktypes.map(art => `Container.Art(${art})`))
			.concat(videoartworktypes.map(art => `Container.ListItem.Art(${art})`))
			.concat(videoartworktypes.map(art => `Player.Art(${art})`))
			.sort()},
	musicart: {title: 'Music art', order: 1.5, special: 'popupinfo',
		filter: ([_, value]) => value,
		mapper: ([key, value]) => [key, value.includes('/') | value.includes('\\') ? toolbox.imageencode(value) : value],
		list: musicartworktypes.map(art => `ListItem.Art(${art})`)
			.concat(musicartworktypes.map(art => `Container.Art(${art})`))
			.concat(musicartworktypes.map(art => `Container.ListItem.Art(${art})`))
			.concat(musicartworktypes.map(art => `Player.Art(${art})`))
			.sort()},
	player: {title: 'Player InfoLabels', order: 9,
		list: ['Time', 'FinishTime', 'TimeRemaining', 'Duration', 'SeekTime', 'SeekStepSize',
			'StartTime', 'Title', 'TimeSpeed', 'Chapter', 'ChapterCount']
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
			'CurrentControl', 'CurrentControlID'].map(l => 'System.' + l)
			.concat(['AspectRatio', 'CurrentTheme', 'CurrentColourTheme', 'Font'].map(l => 'Skin.' + l))
			.concat('Window.Property(xmlfile)', 'Weather.Conditions')
			.concat(['IsDHCP', 'IPAddress', 'LinkState'].map(l => 'Network.' + l)).sort()},
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
			'IsTempo', 'HasGame'].map(l => 'Player.' + l)
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
skinlabels.containerlistitem = {title: 'Container.ListItem InfoLabels', order: 5,
	list: skinlabels.listitem.list.map(l => 'Container.' + l)}
skinlabels.addonlistitem.list = skinlabels.addonlistitem.list.map(l => 'Container.' + l)
	.concat(skinlabels.addonlistitem.list)
skinlabels.musiclistitem.list = skinlabels.musiclistitem.list.map(l => 'Container.' + l)
	.concat(skinlabels.musiclistitem.list)

const appdata = {
	connection: null,
	connections: {},
	currentaction: null,
	runningvis: [],
	apphidden: false,
	runningspeed: 1000,
	scriptwindows: [],
	show_allart: false,
	connect: async function(host) {
		if (!host || this.connection && this.connection.connected() && this.connection.host === host) return
		this.disconnect()
		let con
		try {
			con = new toolbox.Connection(host)
		} catch(e) {
			console.log(e)
			return
		}
		this.connection = con
		if (!(host in this.connections))
			UI.add_connection(con.host, con.host)
		con.on('notification', ({description, data: {method, params: {sender, data}}}) => {
			if (con.host === this.connection.host)
				UI.add_notification(description, method, sender, data)
		})
		con.on('statuschange', ({connected}) => {
			if (con === this.connection) {
				UI.set_connectionstatus(connected)
			}
		})
		con.on('pingtime', ({time}) => {
			if (con === this.connection)
				UI.set_hostping(time)
		})
		await con.connect()
		await con.populatedata()

		this.connection = this.connections[con.host] = con
		UI.add_connection(con.host, con.name)
		UI.set_connection(con.name, con.host)
		UI.set_methodlist(con.methods)
		UI.set_connectionstatus(true)
		hashman.handle_hashchange()
		store(this.connection.host, this.connection.name)
	},
	set_runningparam: function(param, visible) {
		if (visible)
			this.runningvis.push(param)
		else {
			const index = this.runningvis.indexOf(param)
			if (index !== -1)
				this.runningvis.splice(index, 1)
		}
		hashman.set(this.currentaction, toolbox.arr2obj(this.runningvis, true), true)
	},
	set_runningparams: function(params) {
		this.runningvis = Object.entries(params).filter(e => e[1] === 'true').map(e => e[0])
	},
	togglerunningspeed: function() {
		this.runningspeed = this.runningspeed == 0 ? 1000 : this.runningspeed == 200 ? 0 : 200
		UI.set_pingspeed(this.runningspeed)
	},
	setaction: async function(action, params) {
		if (this.currentaction === action) {
			UI.update_params(params)
			if (action === '!RunningData')
				this.set_runningparams(params)
			return
		}
		this.currentaction = action
		if (action.startsWith('!')) {
			if (action === '!RunningData') {
				UI.set_isrunning(true)
				this.set_runningparams(params)
				UI.set_runningsections(Object.entries(skinlabels).sort((e1, e2) => e1[1].order - e2[1].order)
					.map(([key, obj]) => [key, obj.title, obj.visible]))
				UI.update_params(params)
				UI.set_runningdata(false)
				// IDEA: Both of these could be refreshed when host changes
				await this.loadskinwindows()
				if (this.show_allart)
					this.loadarttypes()
				while (this.currentaction === action) {
					if (this.apphidden) {
						await sleep(1000)
						continue
					}
					try {
						await this.update_runningdata()
						await sleep(this.runningvis.length ? this.runningspeed : 1000)
					} catch (err) {
						if (!['no-connection', 'timeout', 'no-result'].includes(err.code))
							console.log(err)
						await sleep(err.code === 'timeout' ? this.runningspeed : 5000)
					}
				}
				UI.set_isrunning(false)
			}
			return
		}
		this.runningvis = []
		const [ns, methodpart] = action.split('.', 2)
		UI.focus_namespace(ns)
		if (methodpart) {
			const data = await this.connection.introspect(action)
			UI.set_result(`Definition of '${action}'`, data.methods[action], 'definition')
			UI.set_method(action, data.methods[action])
		}
		UI.update_params(params)
	},
	update_runningdata: async function() {
		const t0 = performance.now()
		for (const [key, value] of Object.entries(skinlabels)) {
			if (this.runningvis.includes(key)) {
				let data = await this.connection.get_infos(value.list || value.boollist, !value.list)
				data = toolbox.process_object(data, value.filter, value.mapper)
				UI.set_runningdata(key, value.list ? data
					: toolbox.arr2obj(Object.keys(data), (_, key) => '' + data[key]), value.special)
			} else
				UI.set_runningdata(key, false)
		}
		UI.set_runningping(Math.trunc(performance.now() - t0))
	},
	executemethod: async function(method, params) {
		hashman.set(method, params, true)
		for (const [key, value] of Object.entries(params)) {
			if (value.startswith(['{', '[', '"', '-', /\d/, 'true', 'false', 'null'])) {
				try {
					params[key] = JSON.parse(value)
				} catch (e) {
					// leave plain string on parse error
					if (!(e instanceof SyntaxError)) throw e
				}
			}
		}
		const req = JSON.stringify({jsonrpc: '2.0', id: this.connection.nextid, method, params})
		UI.set_result(`Calling '${method}' with params`, [params, req], 'calling')
		try {
			const data = await this.connection.call(method, params, {alldata: true})
			UI.set_result(`Result of '${method}'`, [data, req], 'result')
		} catch (err) {
			UI.set_result(`Error calling '${method}'`, [err, req], 'error')
		}
	},
	addhost: function(host) {
		if (!host.startsWith('http')) {
			try {
				host = new URL('http://' + host)
			} catch (e) {
				if (!(e instanceof TypeError)) throw e
				return
			}
		}
		this.connect(host)
	},
	removehost: function(host) {
		if (host in this.connections) {
			if (this.connections[host])
				this.connections[host].disconnect()
			delete this.connections[host]
		}
		store.remove(host)
	},
	disconnect: function() {
		UI.set_connectionstatus(false)
		UI.set_connection('No host', '')
		if (this.connection)
			this.connection.disconnect()
	},
	add_connection: function(host, name) {
		this.connections[host] = null
		UI.add_connection(host, name)
	},
	loadskinwindows: async function() {
		const notwindows = ['includes', 'view', 'variables', 'defaults', 'font', 'pointer']
		const is_skinwindow = l => l.toLowerCase().endsWith('xml') && !l.toLowerCase().startswith(notwindows)
		if (skinlabels.visiblewindows.boollist.length)
			skinlabels.visiblewindows.boollist = []
		const skindirs = (await this.connection.call('Files.GetDirectory', ['special://skin/'])).files
			.filter(e => e.filetype === 'directory').map(e => e.label)
		for (const dir of skindirs) {
			const data = await this.connection.call('Files.GetDirectory', ['special://skin/' + dir])
			if (!(data && data.files.some(item => item.label.toLowerCase() === 'home.xml')))
				continue // not the XML directory
			const windowfiles = data.files.filter(f => is_skinwindow(f.label)).map(f => f.label)
			const newscripts = windowfiles.filter(f => f.startsWith('script-') && !this.scriptwindows.includes(f))
			if (newscripts.length) {
				this.scriptwindows = this.scriptwindows.concat(newscripts)
				store.savescriptwindows(this.scriptwindows)
			}
			skinlabels.visiblewindows.boollist = windowfiles.concat(this.scriptwindows).map(f => `Window.IsVisible(${f})`)
			break
		}
	},
	loadarttypes: async function() {
		const allart = arttypelist2infolabels(arttypemap2list(await getall_arttypes()))
		skinlabels.videoart.list = allart.video
		skinlabels.musicart.list = allart.music
	}
}
window.addEventListener("visibilitychange", () => appdata.apphidden = document.hidden)

const set_custominfo = (labels, booleans) => {
	if (labels)
		skinlabels['customlabels']['list'] = labels.filter(l => l)
	if (booleans)
		skinlabels['custombooleans']['boollist'] = booleans.filter(b => b)
}

UI.on('executemethod', ({method, params}) => appdata.executemethod(method, params))
UI.on('set_runningparam', ({param, visible}) => appdata.set_runningparam(param, visible))
UI.on('togglerunningspeed', () => appdata.togglerunningspeed())
UI.on('addhost', host => appdata.addhost(host))
UI.on('removehost', host => appdata.removehost(host))
UI.on('selecthost', host => appdata.connect(host))
UI.on('disconnect', () => appdata.disconnect())
UI.on('themechange', themename => store.savetheme(themename))
UI.on('setswitch', (name, value) => store.setswitch(name, value))
UI.on('setcustominfo', ({labels, booleans}) => {
	set_custominfo(labels, booleans)
	store.savecustom(labels, booleans)
})

const KEY_PRE = 'devhelperforkodi.'
const CONNECTIONS_KEY = KEY_PRE + 'connections'
const CUSTOMINFO_KEY = KEY_PRE + 'custominfo'
const THEME_KEY = KEY_PRE + 'themeinfo'
const SCRIPTWINDOWS_KEY = KEY_PRE + 'scriptwindows'
const SWITCHES_KEY = KEY_PRE + 'switches'

const writelocal = (data, key=CONNECTIONS_KEY) => localStorage.setItem(key, JSON.stringify(data))
writelocal.custom = data => writelocal(data, CUSTOMINFO_KEY)
writelocal.theme = data => writelocal(data, THEME_KEY)
writelocal.scriptwindows = data => writelocal(data, SCRIPTWINDOWS_KEY)
writelocal.switches = data => writelocal(data, SWITCHES_KEY)

function store(host, name) {
	// [0] map of hosts, [1] currently selected host
	store._connections[0][host] = name
	store._connections[1] = host
	writelocal(store._connections)
}
store.remove = function(host) {
	delete store._connections[0][host]
	if (store._connections[1] === host)
		store._connections[1] = ''
	writelocal(store._connections)
}
store.savecustom = function(infolabels, infobooleans) {
	if (!store._custom)
		store._custom = [[], []]
	if (infolabels)
		store._custom[0] = infolabels
	if (infobooleans)
		store._custom[1] = infobooleans
	writelocal.custom(store._custom)
}
store.setswitch = function(switch_, value) {
	if (!store._switches)
		store._switches = {}
	store._switches[switch_] = value
	writelocal.switches(store._switches)
}
store.savetheme = themename => writelocal.theme(themename)
store.savescriptwindows = windowlist => writelocal.scriptwindows(windowlist)

store._connections = JSON.parse(localStorage.getItem(CONNECTIONS_KEY))
store._custom = JSON.parse(localStorage.getItem(CUSTOMINFO_KEY))
store._theme = JSON.parse(localStorage.getItem(THEME_KEY))
store._scriptwindows = JSON.parse(localStorage.getItem(SCRIPTWINDOWS_KEY))
store._switches = JSON.parse(localStorage.getItem(SWITCHES_KEY))

UI.on('loaded', () => {
	if (store._connections) {
		Object.entries(store._connections[0]).forEach(e => appdata.add_connection(...e))
		appdata.connect(store._connections[1])
	} else {
		store._connections = [{}, '']
		let host = window.location.origin
		if (!window.location.pathname.startsWith('/addons/'))
			host += window.location.pathname
		appdata.connect(host)
	}
	const subtitles = ["It's not really for goats...", "A possible solution for number b",
		"which has its own super-teeny-tiny coffee bar inside...",
		"White space: you can't see 'em, how does it work?"]
	UI.set_subtitle(toolbox.randomitem(subtitles, 15))
	if (store._theme)
		UI.set_theme(store._theme)
	if (store._switches) {
		if (store._switches.show_logbutton)
			UI.show_logbutton()
		if (store._switches.show_pdbbutton)
			UI.show_pdbbutton()
		if (store._switches.show_allart) {
			appdata.show_allart = true
			UI.set_showallart()
		}
	}
	if (store._custom) {
		set_custominfo(...store._custom)
		UI.set_custominfo_options(...store._custom)
	}
	appdata.scriptwindows = store._scriptwindows ? store._scriptwindows :
		['service-LibreELEC-Settings-mainWindow.xml', 'script-NextAired-TVGuide.xml',
			'script-NextAired-TVGuide2.xml', 'script-The Big Pictures Screensaver-main.xml',
			'script-script.extendedinfo-DialogInfo.xml', 'script-script.extendedinfo-DialogVideoInfo.xml',
			'script-script.extendedinfo-VideoList.xml', 'script-script.extendedinfo-YoutubeList.xml',
			'script-nextup-notification-PostPlayInfo.xml', 'script-nextup-notification-NextUpInfo.xml',
			'script-nextup-notification-StillWatchingInfo.xml', 'script-nextup-notification-UnwatchedInfo.xml',
			'script-stinger-notification-Notification.xml', 'settings_gui.xml' /* My OSMC */]
	UI.hidesplash()
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function getall_arttypes() {
	// In the library, but plugins can provide other artwork types
	const mediatypes = {'movie': 'VideoLibrary.GetMovies', 'tvshow': 'VideoLibrary.GetTVShows',
		'set': 'VideoLibrary.GetMovieSets', 'season': 'VideoLibrary.GetSeasons',
		'musicvideo': 'VideoLibrary.GetMusicVideos', 'artist': 'AudioLibrary.GetArtists',
		'album': 'AudioLibrary.GetAlbums'}
	const result = {}
	for (const type in mediatypes) {
		const data = await appdata.connection.call(mediatypes[type], {"properties":["art"]})
		const lists = data[type + 's'].map(mov => Object.keys(mov.art).filter(filterart))
		result[type] = toolbox.uniquelist([].concat(...lists))
		await sleep(100)
	}
	return result
}
function arttypemap2list(typemap) {
	const vidtypes = ['movie', 'tvshow', 'set', 'season', 'musicvideo']
	const vidtypes_parent = ['tvshow', 'set', 'season']
	return {
		video: toolbox.uniquelist(['thumb'].concat(...vidtypes.map(t => typemap[t]))
			.concat(...vidtypes_parent.map(mapart(typemap)))).sort(),
		music: toolbox.uniquelist([].concat(...['album', 'artist'].map(t => typemap[t]))
			.concat(...['album', 'artist'].map(mapart(typemap)))
			.concat(...['artist1', 'artist2', 'albumartist', 'albumartist1', 'albumartist2']
				.map(mapart(typemap, 'artist')))).sort()
	}
}
function arttypelist2infolabels(typelist) {
	const pres = ['ListItem', 'Container', 'Container.ListItem', 'Player']
	return toolbox.arr2obj(['video', 'music'], (_, type) => [].concat(...pres.map(mappre(typelist[type]))))
}
const mapart = (typemap, forcekey) => parent => typemap[forcekey || parent].map(art => parent + '.' + art)
const mappre = allart => pre => allart.map(art => pre + `.Art(${art})`)

function filterart(arttype, allnumbered=true) {
	if (arttype.includes('.'))
		return false
	if (allnumbered)
		return true
	const match = arttype.match(/[0-9]+$/)
	return match ? parseInt(match[0], 10) < 2 : true
}
