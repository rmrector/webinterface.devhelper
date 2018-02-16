'use strict'

// TODO: preview more information on item in notifications. OnPlay preview could include basic info like
//  media title, season/episode numbers, artist/album/TV show
// TODO: ctrl+click InfoLabels and Booleans to add to custom list

// TODO: Switch to turn ListItem InfoLabels into Container.ListItem, maybe a few switches to only check classes
//  of artwork (Player/ListItem/Container/Container.ListItem, artist+albumartist, fanart# > 2)

// TODO: Include more script windows from add-ons
// Window.Property(xmlfile) will have a full path to the window file if it's not in the current skin,
//  loaded from the add-on instead

// TODO: maybe easier to grok media listings would be helpful

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

// TODO: Build the list of all available art (available in the library, but plugins can have others)
// TODO: Somehow build the info lists automatically, at least most of them

// INFO: Integer labels don't work, like "Player.Progress"
// Contaner InfoBooleans 'OnNext', 'OnScrollNext', 'OnScrollPrevious', 'OnPrevious' are triggers for
//  animations and aren't much use here

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
		mapper: ([key, value]) => [key, value.includes('/') | value.includes('\\') ? toolbox.imageencode(value) : value],
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
	lightsystemlabels: {title: 'Sys Info', order: 97,
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
	connect: function(host) {
		if (!host || this.connection && this.connection.connected() && this.connection.host === host) return
		this.disconnect()
		let con
		try {
			con = new toolbox.Connection(host)
		} catch(e) {
			return
		}
		this.connection = con
		if (!(host in this.connections))
			UI.add_connection(con.host, con.host)
		const after_connection = () => {
			this.connection = this.connections[con.host] = con
			UI.add_connection(con.host, con.name)
			UI.set_connection(con.name, con.host)
			UI.set_methodlist(con.methods)
			UI.set_connectionstatus(true)
			hashman.handle_hashchange()
			store(this.connection.host, this.connection.name)
		}
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
		con.connect().then(() => con.populatedata()).then(() => after_connection())
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
	setaction: function(action, params) {
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
				this.loadskinwindows()
				const update_runningdata = () => {
					if (this.apphidden) {
						setTimeout(update_runningdata, 1000)
						return
					}
					if (this.currentaction !== action) {
						UI.set_isrunning(false)
						return
					}
					const t0 = performance.now()
					Promise.resolve().then(() => {
						return Object.entries(skinlabels).reduce((promise, [key, value]) => promise.then(() => {
							if (this.runningvis.includes(key))
								return this.connection.get_infos(value.list || value.boollist, !value.list)
								.then(data => toolbox.process_object(data, value.filter, value.mapper)).then(data => {
									UI.set_runningdata(key, value.list ? data
										: toolbox.arr2obj(Object.keys(data), (_, key) => '' + data[key]), value.special)
								})
							return Promise.resolve().then(() => UI.set_runningdata(key, false))
						}), Promise.resolve())
					}).then(() => UI.set_runningping(Math.trunc(performance.now() - t0)))
					.then(() => setTimeout(update_runningdata, this.runningvis.length ? this.runningspeed : 1000))
					.catch(err => {
						setTimeout(update_runningdata, err.code === 'timeout' ? this.runningspeed : 5000)
						if (!['no-connection', 'timeout', 'no-result'].includes(err.code))
							console.log(err)
					})
				}
				update_runningdata()
			}
			return
		}
		this.runningvis = []
		const [ns, methodpart] = action.split('.', 2)
		UI.focus_namespace(ns)
		if (methodpart) {
			this.connection.introspect(action).then(data => {
				UI.set_result(`Definition of '${action}'`, data.methods[action], 'definition')
				UI.set_method(action, data.methods[action])
				UI.update_params(params)
			})
		} else
			UI.update_params(params)
	},
	executemethod: function(method, params) {
		if (Object.keys(params).length !== 0)
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
		this.connection.call(method, params).then(data => UI.set_result(`Result of '${method}'`, [data, req], 'result'))
		.catch(err => UI.set_result(`Error calling '${method}'`, err, 'error'))
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
		UI.set_connection('No host', {}, '')
		if (this.connection)
			this.connection.disconnect()
	},
	add_connection: function(host, name) {
		this.connections[host] = null
		UI.add_connection(host, name)
	},
	loadskinwindows: function() {
		const notwindows = ['includes', 'view', 'variables', 'defaults', 'font', 'pointer']
		const is_skinwindow = l => l.toLowerCase().endsWith('xml') && !l.toLowerCase().startswith(notwindows)
		if (skinlabels.visiblewindows.boollist.length)
			skinlabels.visiblewindows.boollist = []
		return this.connection.call('Files.GetDirectory', ['special://skin/']).then(data =>
			data.files.filter(e => e.filetype === 'directory').map(e => e.label))
		.then(data => data.reduce((promise, dir) => promise.then(() => {
			if (skinlabels.visiblewindows.boollist.length)
				throw undefined // Already found the skin directory
			return this.connection.call('Files.GetDirectory', ['special://skin/' + dir]).then(data => {
				if (!(data && data.files.some(item => item.label.toLowerCase() === 'home.xml')))
					throw undefined // This isn't the skin directory
			}).then(() => this.connection.call('Files.GetDirectory', ['special://skin/' + dir]))
			.then(data => data.files.filter(f => is_skinwindow(f.label)).map(f => f.label))
			.then(files => {
				const newscripts = files.filter(f => f.startsWith('script-') && !this.scriptwindows.includes(f))
				if (newscripts.length) {
					this.scriptwindows = this.scriptwindows.concat(newscripts)
					store.savescriptwindows(this.scriptwindows)
				}
				return files
			})
			.then(files => files.concat(this.scriptwindows).map(f => `Window.IsVisible(${f})`))
			.then(data => skinlabels.visiblewindows.boollist = data)
			.catch(err => {
				if (err)
					throw err
			})
		}), Promise.resolve())).catch(err => {
			if (err)
				throw err
		})
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
		appdata.connect(window.location.origin)
	}
	const subtitles = ["It's not really for goats...", "A possible solution for number b"]
	UI.set_subtitle(subtitles[Math.floor(Math.random() * (subtitles.length + 10))] || '')
	if (store._theme)
		UI.set_theme(store._theme)
	if (store._switches) {
		if (store._switches.show_logbutton)
			UI.show_logbutton()
		if (store._switches.show_pdbbutton)
			UI.show_pdbbutton()
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

function getall_arttypes() {
	const mediatypes = {'movie': 'VideoLibrary.GetMovies', 'tvshow': 'VideoLibrary.GetTVShows',
		'set': 'VideoLibrary.GetMovieSets', 'season': 'VideoLibrary.GetSeasons',
		'musicvideo': 'VideoLibrary.GetMusicVideos', 'artist': 'AudioLibrary.GetArtists',
		'album': 'AudioLibrary.GetAlbums'}
	const result = {}
	return Object.keys(mediatypes).reduce((promise, mediatype) => promise.then(() =>
		appdata.connection.call(mediatypes[mediatype], {"properties":["art"]})
		.then(data => data[mediatype + 's'].map(mov => Object.keys(mov.art).filter(at => !at.includes('.'))))
		.then(lists => toolbox.uniquelist([].concat(...lists)))
		.then(list => result[mediatype] = list)
	), Promise.resolve()).then(() => result)
}
