'use strict'

const TIMEOUT = 60000

/** Python-like, all remaining text is added as result[count] rather than tossed */
String.prototype.splitc = function(split, count) {
	if (!count) return this.split(split)
	return this.split(split).reduce((result, cur) => {
		if (count < 0)
			result[result.length - 1] += split + cur
		else
			result.push(cur)
		count -= 1
		return result
	}, [])
}
/** Accepts a list of prefixes - can include regex */
String.prototype.startswith = function(prefixes) {
	if (typeof prefixes === "string")
		prefixes = [prefixes]
	for (const prefix of prefixes) {
		if (prefix instanceof RegExp) {
			if (this.search(prefix) === 0)
				return true
		} else if (this.startsWith(prefix))
			return true
	}
	return false
}

Object.defineProperty(debug = new Proxy(debug, {
	get: (target, prop) => isdebug && target[prop]
}), 'all', {
	set: (value) => Object.keys(debug).forEach(key => debug[key] = value)
})

const toolbox = {}

toolbox.EventEmitter = function() {
	this.callbacks = {}
}
toolbox.EventEmitter.prototype.on = function(event_name, callback) {
	if (!this.callbacks[event_name]) this.callbacks[event_name] = []
	this.callbacks[event_name].push(callback)
	return this // chainable
}
toolbox.EventEmitter.prototype.emit = function(event_name, ...data) {
	this._dispatch(event_name, ...data)
	return this
}
toolbox.EventEmitter.prototype._dispatch = function(event_name, ...data) {
	let events = this.callbacks[event_name]
	if(!events) return
	events.forEach(e => e(...data))
}
toolbox.EventEmitter.prototype.resetevents = function() {
	this.callbacks = {}
}


/**
 * Turn an array into an object, values to keys
 * @param {Array} arr
 * @param {*|function(obj, key, idx)} value static value or function that calculates a value
 */
toolbox.arr2obj = function(arr, value) {
	return arr.reduce((obj, key, idx) => {
		obj[key] = typeof value === 'function' ? value(obj, key, idx) : value
		return obj
	}, {})
}

/**
 * Filter and map the entries of an object
 * @param {Object} obj
 * @param {bool function(entry)} [filter]
 * @param {[key, value] function(entry)} [mapper]
 */
toolbox.process_object = function(obj, filter, mapper) {
	if (!filter && !mapper) return obj
	return Object.entries(obj).filter(entry => filter ? filter(entry) : true).reduce((result, entry) => {
		if (mapper)
			entry = mapper(entry)
		result[entry[0]] = entry[1]
		return result
	}, {})
}

toolbox.has_samedata = function(obj1, obj2) {
	// Simple array and object compare
	if (obj1 == null || obj2 == null || !(obj1 instanceof Object || Array.isArray(obj1))
	|| !(obj2 instanceof Object || Array.isArray(obj2)))
		return obj1 === obj2
	let isarray = Array.isArray(obj1)
	if (isarray && isarray === Array.isArray(obj2)) {
		if (obj1.length !== obj2.length)
			return false
		return !obj1.some((item, idx) => item !== obj2[idx])
	} else if (!isarray) {
		const ent1 = Object.entries(obj1)
		const ent2 = Object.entries(obj2)
		if (ent1.length !== ent2.length)
			return false
		return !ent1.some((entry, idx) => entry[0] !== ent2[idx][0] || entry[1] !== ent2[idx][1])
	}
	return false
}

toolbox.rangegen = function*(start, edge, step) {
	if (edge === undefined) {
		edge = start
		start = 0
	}
	edge = edge || 0
	step = step || 1

	for (; (edge - start) * step > 0; start += step) {
		yield start
	}
}
toolbox.range = (start, edge, step) => Array.from(toolbox.rangegen(start, edge, step))

toolbox.randomitem = (list, odds=0) => list[Math.floor(Math.random() * list.length * (1 + odds))] || ''

const _pipe = (f1, f2) => (...args) => f2(f1(...args))
const pipe = (...fns) => fns.reduce(_pipe)
toolbox.pipe = pipe

const set = list => new Set(list)
toolbox.uniquelist = pipe(set, Array.from)

// IDEA: jskodi
toolbox.imageencode = image => image.startswith('image://') ? image : 'image://' + encodeURIComponent(image) + '/'
toolbox.imagedecode = image => decodeURIComponent(image.slice(8, -1))

/**
 * A connection to Kodi
 * @param {string|URL} host
 * @param {Object} websocket_options
 * @param {string} websocket_options.base Websocket server reverse proxy path
 * @param {string} websocket_options.port
 * @param {string} websocket_options.secure
 * @constructor
 */
toolbox.Connection = function(host, {base='', port='9090', secure=false}={}) {
	if (typeof host === 'string')
		host = new URL(host)
	if (host.protocol !== 'http:' && host.protocol !== 'https:')
		throw new Error("Host must be HTTP or HTTPS")
	toolbox.EventEmitter.call(this)
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
	this.timer
	this.name
}
toolbox.Connection.prototype = new toolbox.EventEmitter()
toolbox.Connection.prototype.connected = function() {
	return this.socket && this.socket.readyState === WebSocket.OPEN
}
toolbox.Connection.prototype.connect = function() {
	async function prepare_connection(connection) {
		const data = await connection.call('Application.GetProperties', {properties: ['name', 'version']})
		connection.name = data.name + ' ' + data.version.major + '.' + data.version.minor
		if (data.version.tag !== 'stable')
			connection.name += ' ' + data.version.tag
		let name = await connection.call('XBMC.GetInfoLabels', {labels: ['System.FriendlyName']})
		name = name['System.FriendlyName']
		if (name.startsWith('Kodi (') && name.endsWith(')'))
			name = name.slice(6, -1)
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
		const watchconnection = async () => {
			if (this.connected()) {
				const t0 = performance.now()
				try {
					await this.ping()
					this.emit('pingtime', {time: (performance.now() - t0).toFixed(1)})
				} catch (e) {
					this.disconnect(false)
					await this.connect()
				}
			} else if (this.socket.readyState === WebSocket.CLOSED) {
				console.log('no connection, trying to reconnect')
				this.disconnect(false)
				await this.connect()
				resolve(this)
			}
			this.timer = setTimeout(watchconnection, TIMEOUT)
		}
		this.timer = setTimeout(watchconnection, TIMEOUT)
	})
}
toolbox.Connection.prototype.disconnect = function(removelisteners=true) {
	if (removelisteners)
		this.resetevents()
	if (!this.socket)
		return
	clearTimeout(this.timer)
	this.socket.onclose = null
	this.socket.close()
	this.socket = null
}
toolbox.Connection.prototype.call = function(method, params,
		{id=undefined, logcall=isdebug, alldata=false}={}) {
	return new Promise((resolve, reject) => {
		if (!this.connected()) {
			reject(build_error('no-connection', "Not connected to Kodi"))
			return
		}
		if (id == null)
			id = this.nextid++
		else if (id in this.openmethods) {
			reject(build_error('duplicate-open-request'))
			return
		}
		const request = {jsonrpc: '2.0', method, params, id}
		if (logcall)
			console.log('Request', request)
		const strequest = JSON.stringify(request)
		if (strequest.length > 1024) {
			reject(build_error('too-long', "Request is too long for Kodi websocket"))
			// TODO: No CORS, only works on same host
			if (false) resolve(this.http_call(request).then(data => {
				if (logcall)
					console.log('Result', data)
				if (data.result)
					return alldata ? data : data.result
				throw (alldata ? data : data.error) || build_error('no-result')
			}))
			return
		}
		this.openmethods[id] = {method, params}
		const timeout = setTimeout(() => {
			delete this.openmethods[id]
			this.socket.removeEventListener('message', handlethismessage)
			reject(build_error('timeout', "Method call timed out after 30s"))
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
				reject((alldata ? data : data.error) || build_error('no-result'))
		}
		this.socket.addEventListener('message', handlethismessage)
		this.socket.send(strequest)
	})
}
toolbox.Connection.prototype.http_call = function(request) {
	return fetch(this.host + '/jsonrpc', {method: 'POST', body: request, mode: 'no-cors',
		headers: {'Content-Type': 'application/json'}
	}).then(r => r.json())
}
toolbox.Connection.prototype.populatedata = async function() {
	const args = {getmetadata: true}
	const data = await this.call('JSONRPC.Introspect', args)
	if (data.notifications)
		this.notifications = data.notifications
	if (data.types)
		this.reftypes = dereference(extend(data.types), data.types)
	if (data.methods)
		this.methods = toolbox.process_object(data.methods, undefined,
			([key, {description}]) => [key, description])
	return data
}
toolbox.Connection.prototype.introspect = async function(methodname) {
	if (!methodname)
		throw new Error('methodname is required')
	const args = {getdescriptions: true, getmetadata: true, filterbytransport: false,
		filter: {getreferences: false, id: methodname, type: 'method'}}
	const data = await this.call('JSONRPC.Introspect', args)
	dereference(data.methods[methodname], this.reftypes)
	return data
}
toolbox.Connection.prototype.get_infos = async function(infos, booleans=false) {
	if (!infos || !infos.length) return {}
	// Kodi doesn't like requests > 1024 bytes
	const method = !booleans ? 'XBMC.GetInfoLabels' : 'XBMC.GetInfoBooleans'
	const listoflists = infos.reduce((result, item) => {
		if (result.length && result[result.length - 1].join('","').length + item.length < 930)
			result[result.length - 1].push(item)
		else
			result.push([item])
		return result
	}, [])
	const result = {}
	for (const list of listoflists) {
		Object.assign(result, await this.call(method, [list],
			{id: "runningdata", logcall: debug.runningdata}))
	}
	return result
}
toolbox.Connection.prototype.ping = function() {
	return this.call('JSONRPC.Ping', undefined, {id: "ping", logcall: debug.ping})
}

function build_error(code, message) {
	const err = new Error(message)
	err.code = code
	err.errmessage = message
	err['* source'] = 'web interface'
	return err
}

function dereference(obj, reftypes) {
	if (Array.isArray(obj)) {
		for (const o of obj) {
			dereference(o, reftypes)
		}
	} else if (obj instanceof Object) {
		Object.values(obj).forEach(o => dereference(o, reftypes))
		if ('$ref' in obj && obj.$ref in reftypes) {
			Object.assign(obj, reftypes[obj.$ref])
			delete obj.$ref
		}
	}
	return obj
}

function extend(reftypes) {
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
					mergeall(obj, extends_)
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

const mergeall = (first, others) => others.reduce(merge, first)
function merge(obj, nextobj) {
	// the original properties take preference when they are not mergeable
	if (obj == null || nextobj == null || !(obj instanceof Object || Array.isArray(obj)) ||
			!(nextobj instanceof Object || Array.isArray(nextobj)))
		return obj
	let isarray = Array.isArray(obj)
	if (isarray && isarray === Array.isArray(nextobj)) {
		return [...obj, ...nextobj]
	} else if(!isarray) {
		Object.keys(nextobj).forEach(function(newkey) {
			obj[newkey] = obj[newkey] ? merge(obj[newkey], nextobj[newkey]) : nextobj[newkey]
		})
	}
	return obj
}
