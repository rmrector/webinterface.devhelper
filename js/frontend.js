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
// - renderJSON helps, but more could be done
// - why not a full-fledged filter/map/reduce?
// - this probably goes in yet another project

// TODO: Window.IsActive at the top of Visible Windows with a different style
//  Will double the size of the JSON-RPC request or require a second request

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
	if (action === '!RunningData')
		appstate.actions.set_mode('RunningData', true)
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

const runningspeeds = [1000, 200, 0, 5000]

const appdata = {
	connection: null,
	connections: {},
	currentaction: null,
	runningvis: [],
	apphidden: false,
	runningspeed: 1000,
	connect: async function(host) {
		if (!host || this.connection && this.connection.connected() && this.connection.host === host)
			return
		this.disconnect()
		let con
		try {
			con = new jskodi.Connection(host)
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
		appstate.actions.set_connection(con.host)
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
		this.runningspeed = toolbox.nextitem(runningspeeds, this.runningspeed)
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
				this.set_runningparams(params)
				appstate.actions.set_runningsections(jskodi.skinlabels.get_categories()
					.sort((a, b) => a[1].order - b[1].order)
					.map(([key, obj]) => [key, obj.title, obj.visible]))
				UI.update_params(params)
				UI.set_runningdata(false)
				// IDEA: could be refreshed when host changes
				await this.loadskinwindows()
				while (this.currentaction === action) {
					if (this.apphidden) {
						await toolbox.sleep(1000)
						continue
					}
					try {
						await this.update_runningdata()
						await toolbox.sleep(this.runningvis.length ? this.runningspeed : 1000)
					} catch (err) {
						if (!['no-connection', 'timeout', 'no-result'].includes(err.code))
							console.log(err)
						await toolbox.sleep(err.code === 'timeout' ? this.runningspeed : 5000)
					}
				}
			}
			return
		}
		appstate.actions.set_mode('', true)
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

		const boollist_filter = data => toolbox.arr2obj(Object.keys(data), (_, key) => '' + data[key])
		for (const [category, options] of jskodi.skinlabels.get_categories()) {
			if (this.runningvis.includes(category)) {
				let data = await this.connection.get_infos(options.list || options.boollist, !options.list)
				data = toolbox.process_object(data, options.filter, options.mapper)
				UI.set_runningdata(category, options.list ? data : boollist_filter(data), options.special)
			} else
				UI.set_runningdata(category, false)
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
			window.jsonrpc_result = data
		} catch (err) {
			UI.set_result(`Error calling '${method}'`, [err, req], 'error')
			window.jsonrpc_result = err
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

		const skindirs = (await this.connection.call('Files.GetDirectory', ['special://skin/'])).files
			.filter(e => e.filetype === 'directory').map(e => e.label)
		let windowbools = []
		for (const dir of skindirs) {
			const data = await this.connection.call('Files.GetDirectory', ['special://skin/' + dir])
			if (!(data && data.files.some(item => item.label.toLowerCase() === 'home.xml')))
				continue // not the XML directory
			const windowfiles = data.files.filter(f => is_skinwindow(f.label)).map(f => f.label)
			const scriptwindows = appstate.shared.settings.customwindows
			const newscripts = windowfiles.filter(f => f.startsWith('script-') && !scriptwindows.includes(f))
			if (newscripts.length) {
				appstate.actions.set_customwindows(scriptwindows.concat(newscripts))
			}
			windowbools = windowfiles.concat(appstate.shared.settings.customwindows)
				.map(f => `Window.IsVisible(${f})`)
			break
		}
		jskodi.skinlabels.set_visiblewindows(windowbools)
	}
}
window.addEventListener("visibilitychange", () => appdata.apphidden = document.hidden)

UI.on('executemethod', ({method, params}) => appdata.executemethod(method, params))
UI.on('set_runningparam', ({param, visible}) => appdata.set_runningparam(param, visible))
UI.on('togglerunningspeed', () => appdata.togglerunningspeed())
UI.on('addhost', host => appdata.addhost(host))
UI.on('removehost', host => appdata.removehost(host))
UI.on('selecthost', host => appdata.connect(host))
UI.on('disconnect', () => appdata.disconnect())
UI.on('setcustominfo', ({labels, booleans}) => {
	jskodi.skinlabels.set_custominfo(labels, booleans)
	store.savecustom(labels, booleans)
})

const KEY_PRE = 'devhelperforkodi.'
const CONNECTIONS_KEY = KEY_PRE + 'connections'
const CUSTOMINFO_KEY = KEY_PRE + 'custominfo'
const THEME_KEY = KEY_PRE + 'themeinfo'
const SCRIPTWINDOWS_KEY = KEY_PRE + 'scriptwindows'
const SWITCHES_KEY = KEY_PRE + 'switches'
const ARTMAP_KEY = KEY_PRE + 'artmap'

const writelocal = (data, key=CONNECTIONS_KEY) => localStorage.setItem(key, JSON.stringify(data))
writelocal.custom = data => writelocal(data, CUSTOMINFO_KEY)
writelocal.theme = data => writelocal(data, THEME_KEY)
writelocal.scriptwindows = data => writelocal(data, SCRIPTWINDOWS_KEY)
writelocal.switches = data => writelocal(data, SWITCHES_KEY)
writelocal.artmap = data => writelocal(data, ARTMAP_KEY)

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
store.setswitch = function(name, value) {
	if (!store._switches)
		store._switches = {}
	store._switches[name] = value
	writelocal.switches(store._switches)
}
store.savetheme = themename => writelocal.theme(themename)
store.savescriptwindows = windowlist => writelocal.scriptwindows(windowlist)
store.saveartmap = artmap => writelocal.artmap(artmap)

store._connections = JSON.parse(localStorage.getItem(CONNECTIONS_KEY))
store._custom = JSON.parse(localStorage.getItem(CUSTOMINFO_KEY))
store._theme = JSON.parse(localStorage.getItem(THEME_KEY))
store._scriptwindows = JSON.parse(localStorage.getItem(SCRIPTWINDOWS_KEY))
store._artmap = JSON.parse(localStorage.getItem(ARTMAP_KEY))
store._switches = JSON.parse(localStorage.getItem(SWITCHES_KEY)) || {}

const SWITCHES = [
	{name: 'show_logbutton', default: false, label: "Show log button"},
	{name: 'show_pdbbutton', default: false, label: "Show Web PDB button (port 5555)"},
	{name: 'highlight_json', default: true, label: "Syntax highlight JSON"},
	{name: 'collapsible_json', default: false, label: "Render collapsible JSON"},
]
const MEDIATYPES = ['movie', 'set', 'tvshow', 'season', 'episode', 'musicvideo',
	'artist', 'album', 'song']

function start_app() {
	// REVIEW: Set `appstate` directly or use actions?
	//  or maybe just one start_app action
	//  or both, like switch_theme calls set_theme
	appstate.shared.settings.switches = store._switches
	for (const switch_ of SWITCHES) {
		if (!(switch_.name in appstate.shared.settings.switches))
			appstate.shared.settings.switches[switch_.name] = switch_.default
	}

	if (store._custom) {
		jskodi.skinlabels.set_custominfo(...store._custom)
		UI.set_custominfo_options(...store._custom)
	}

	appstate.shared.settings.customwindows = store._scriptwindows ? store._scriptwindows :
		['service-LibreELEC-Settings-mainWindow.xml', 'script-NextAired-TVGuide.xml',
			'script-NextAired-TVGuide2.xml',
			'script-script.extendedinfo-DialogInfo.xml', 'script-script.extendedinfo-DialogVideoInfo.xml',
			'script-script.extendedinfo-VideoList.xml', 'script-script.extendedinfo-YoutubeList.xml',
			'script-nextup-notification-PostPlayInfo.xml', 'script-nextup-notification-NextUpInfo.xml',
			'script-nextup-notification-StillWatchingInfo.xml', 'script-nextup-notification-UnwatchedInfo.xml',
			'script-stinger-notification-Notification.xml', 'settings_gui.xml' /* My OSMC */]
	appstate.shared.settings.artmap = store._artmap ? store._artmap : {
		"movie": ["banner", "clearart", "clearlogo", "discart", "fanart", "poster", "thumb", "keyart", "landscape", "characterart"],
		"set": ["fanart", "poster", "banner", "clearlogo", "landscape", "keyart", "clearart", "discart"],
		"tvshow": ["banner", "characterart", "clearart", "clearlogo", "fanart", "landscape", "poster", "keyart"],
		"season": ["poster", "banner", "landscape", "fanart"],
		"episode": ["thumb", "fanart"],
		"musicvideo": ["artistthumb", "clearlogo", "discart", "fanart", "poster", "thumb", "banner", "landscape", "clearart"],
		"artist": ["fanart", "thumb", "banner", "clearart", "clearlogo", "landscape"],
		"album": ["thumb", "discart", "back", "spine"],
		"song": ["thumb"]
	}
	for (const mediatype of MEDIATYPES) {
		if (!(mediatype in appstate.shared.settings.artmap))
			appstate.shared.settings.artmap[mediatype] = []
	}
	jskodi.skinlabels.set_libraryart(appstate.shared.settings.artmap)

	if (!store._connections)
		store._connections = [{}, '']
	Object.entries(store._connections[0]).forEach(e => appdata.add_connection(...e))
	if (!store._connections[1]) {
		store._connections[1] = window.location.origin
		if (!window.location.pathname.startsWith('/addons/'))
			store._connections[1] += window.location.pathname
	}
	appdata.connect(store._connections[1])

	function set_dumb_subtitle() {
		const subtitles = ["It's not really for goats...", "A possible solution for number b",
		"which has its own super-teeny-tiny coffee bar inside...", "I will never, ever outgrow a cookie!",
		"I'm the demographic for free", "like pancakes, but probably has some of my hair in it"]
		const subtitle = toolbox.randomitem(subtitles, 15)
		if (subtitle)
			UI.set_subtitle(subtitle)
	}
	set_dumb_subtitle()
	appstate.actions.set_theme(store._theme)

	do_the_vue()
	UI.hidesplash()
}

const appstate = {
	shared: {
		settings: {
			customwindows: [],
			switches: {},
			theme: '',
			artmap: {}
		},
		loadingartwork: false,
		// TODO: connection is mostly unused down here
		// TODO: additional option for 'connecting'. Allow stopping an in progress connection
		//  and show a different color for the connection button
		connection: {host: '', origin: '', connected: false},
		mode: '',
		dialog: '',
		available_themes: []
	},
	_log(...message) {
		if (!debug.appstate)
			return
		console.log(...message)
	},
	actions: {
		set_mode(newmode, skiphash=false) {
			appstate._log('action:set mode', newmode)

			if (!skiphash)
				hashman.set(newmode ? '!' + newmode : '')

			appstate.shared.mode = newmode
		},
		set_connection(host) {
			appstate._log('action:set connection', host)

			appstate.shared.connection.host = host
			if (!host) {
				appstate.shared.connection.connected = false
				appstate.shared.connection.origin = ''
			} else {
				appstate.shared.connection.connected = true
				appstate.shared.connection.origin = new URL(host).origin
			}
		},
		switch_theme() {
			appstate._log('action:switch theme')
			appstate.actions.set_theme(
				toolbox.nextitem(appstate.shared.available_themes, appstate.shared.settings.theme))
		},
		set_theme(newtheme) {
			if (!appstate.shared.available_themes.includes(newtheme))
				newtheme = appstate.shared.available_themes[0]
			appstate._log('action:set theme', newtheme)
			store.savetheme(newtheme)

			appstate.shared.settings.theme = newtheme
		},
		set_availablethemes(themes) {
			appstate._log('action:set available themes', themes)

			appstate.shared.available_themes = themes
			if (!themes.includes(appstate.shared.settings.theme) && themes.length)
				appstate.shared.settings.theme = themes[0]
		},
		open_settings() {
			appstate._log('action:open settings')

			appstate.shared.dialog = 'settings'
		},
		open_customwindows() {
			appstate._log('action:open custom windows editor')

			appstate.shared.dialog = 'customwindows'
		},
		open_customartmap() {
			appstate._log('action:open custom artmap editor')
			appstate.shared.dialog = 'customartmap'
		},
		save_customartmap(newart) {
			appstate._log('action:save custom artmap', newart)
			for (const key in newart) {
				appstate.shared.settings.artmap[key] = newart[key]
			}
			store.saveartmap(appstate.shared.settings.artmap)
			jskodi.skinlabels.set_libraryart(appstate.shared.settings.artmap)
		},
		close_dialog() {
			appstate._log('action:close dialog')

			appstate.shared.dialog = ''
		},
		set_customwindows(newwindows) {
			appstate._log('action:set custom windows', newwindows)
			store.savescriptwindows(newwindows)

			appstate.shared.settings.customwindows = newwindows
			appdata.loadskinwindows()
		},
		set_switch(name, value) {
			appstate._log('action:set switch', name, value)
			store.setswitch(name, value)

			appstate.shared.settings.switches[name] = value
		},
		open_kodilog() {
			appstate._log('action:open kodi log')

			if (!appstate.shared.connection.connected)
				return
			window.open(appstate.shared.connection.host + "/vfs/special%3A%2F%2Flogpath%2Fkodi.log",
				appstate.shared.connection.origin)
		},
		open_webpdb() {
			appstate._log('action:open web PDB')

			if (!appstate.shared.connection.connected)
				return
			const origin = appstate.getters.connected_origin()
			window.open(origin + ":5555", origin)
		},
		set_runningsections(sections) {
			appstate._log('action:set running sections', sections)
			UI.set_runningsections(sections)
		},
		async load_artlist_fromkodi() {
			appstate._log('action:load artlist from Kodi')
			appstate.shared.loadingartwork = true
			const arttypes = await jskodi.get_library_arttypes()
			for (const mediatype in arttypes) {
				appstate.shared.settings.artmap[mediatype] = appstate.shared.settings.artmap[mediatype]
					.concat(arttypes[mediatype]).filter((v, i , s) => s.indexOf(v) == i)
			}
			appstate.shared.loadingartwork = false
		}
	},
	getters: {
		renderJSON_level: () => appstate.shared.settings.switches.collapsible_json ? 2 :
			appstate.shared.settings.switches.highlight_json ? 1 : 0,
		connected: () => appstate.shared.connection.connected
	}
}

const frontend = {}

const _split_filter = (multiline) => multiline.split('\n').map(str => str.trim()).filter(Boolean)

function do_the_vue() {
	frontend.HeaderButtonsVue = new Vue({
		el: '#header-buttons-vue',
		data: {shared: appstate.shared},
		computed: {
			show_handyactions() { return false },
			show_logbutton() { return this.shared.settings.switches.show_logbutton },
			show_pdbbutton() { return this.shared.settings.switches.show_pdbbutton },
			runningdata_mode() { return this.shared.mode == 'RunningData' }
		},
		methods: {
			start_runningdata: () => appstate.actions.set_mode('RunningData'),
			open_kodilog: () => appstate.actions.open_kodilog(),
			open_webpdb: () => appstate.actions.open_webpdb(),
			open_handyactions: () => {}
		}
	})

	frontend.FooterButtonsVue = new Vue({
		el: '#footer-buttons-vue',
		methods: {
			switch_theme: () => appstate.actions.switch_theme(),
			open_settings: () => appstate.actions.open_settings(),
			open_customwindows: () => appstate.actions.open_customwindows(),
			open_artlist: () => appstate.actions.open_customartmap()
		}
	})

	frontend.CustomWindowsEditorVue = new Vue({
		el: '#customwindows-editor-vue',
		data: {shared: appstate.shared, private: {newwindows: null}},
		computed: {
			customwindows_text: {
				get() {
					return this.shared.settings.customwindows.join('\n')
				},
				set(value) {
					this.private.newwindows = _split_filter(value)
				}
			},
			show() {
				return this.shared.dialog === 'customwindows'
			}
		},
		methods: {
			close() {
				if (this.private.newwindows != null)
					appstate.actions.set_customwindows(this.private.newwindows)
				this.private.newwindows = null
				appstate.actions.close_dialog()
			}
		}
	})

	frontend.CustomArtListEditorVue = new Vue({
		el: '#artlist-editor-vue',
		data: {shared: appstate.shared, private: {newart: {}}},
		computed: {
			show() {
				return this.shared.dialog === 'customartmap'
			},
			loadbutton_text() {
				return this.shared.loadingartwork ? "Loading from Kodi Library ..." : "Load from Kodi Library"
			},
			mediatype_movie: {
				get() { return this.shared.settings.artmap.movie.join('\n') },
				set(value) { this.private.newart.movie = _split_filter(value) }
			},
			mediatype_set: {
				get() { return this.shared.settings.artmap.set.join('\n') },
				set(value) { this.private.newart.set = _split_filter(value) }
			},
			mediatype_tvshow: {
				get() { return this.shared.settings.artmap.tvshow.join('\n') },
				set(value) { this.private.newart.tvshow = _split_filter(value) }
			},
			mediatype_season: {
				get() { return this.shared.settings.artmap.season.join('\n') },
				set(value) { this.private.newart.season = _split_filter(value) }
			},
			mediatype_episode: {
				get() { return this.shared.settings.artmap.episode.join('\n') },
				set(value) { this.private.newart.episode = _split_filter(value) }
			},
			mediatype_musicvideo: {
				get() { return this.shared.settings.artmap.musicvideo.join('\n') },
				set(value) { this.private.newart.musicvideo = _split_filter(value) }
			},
			mediatype_artist: {
				get() { return this.shared.settings.artmap.artist.join('\n') },
				set(value) { this.private.newart.artist = _split_filter(value) }
			},
			mediatype_album: {
				get() { return this.shared.settings.artmap.album.join('\n') },
				set(value) { this.private.newart.album = _split_filter(value) }
			},
			mediatype_song: {
				get() { return this.shared.settings.artmap.song.join('\n') },
				set(value) { this.private.newart.song = _split_filter(value) }
			}
		},
		methods: {
			close() {
				appstate.actions.save_customartmap(this.private.newart)
				this.private.newart = {}
				appstate.actions.close_dialog()
			},
			load_artlist() {
				appstate.actions.load_artlist_fromkodi()
			}
		}
	})

	frontend.SettingsEditorVue = new Vue({
		el: '#settings-dialog-vue',
		data: {shared: appstate.shared},
		computed: {
			switches() {
				const result = SWITCHES.map(switch_ => Object.assign({}, switch_, {
					value: this.shared.settings.switches[switch_.name]
				}))
				return result
			},
			show() {
				return this.shared.dialog === 'settings'
			}
		},
		methods: {
			close() {
				appstate.actions.close_dialog()
			},
			set_switch({target: {name, checked}}) {
				appstate.actions.set_switch(name, checked)
			}
		}
	})
}

frontend.UIShimVue = new Vue({
	el: '#uishim-vue',
	data: {shared: appstate.shared},
	computed: {
		renderJSON_level() {
			return this.shared.settings.switches.collapsible_json ? 2
				: this.shared.settings.switches.highlight_json ? 1 : 0
		}
	},
	watch: {
		renderJSON_level(new_value) {
			UI.configure_renderjson(new_value)
		},
		'shared.settings.theme'(new_value) {
			UI.set_theme(new_value)
		},
		'shared.settings.switches.show_logbutton'(new_value) {
			UI.show_log_description(new_value)
		},
		'shared.settings.switches.show_pdbbutton'(new_value) {
			UI.show_pdb_description(new_value)
		}
	},
	created() {
		appstate.actions.set_availablethemes(UI.get_themes())
	}
})
