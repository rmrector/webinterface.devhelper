'use strict'

String.prototype.splitc = function(split, count) {
	// Python-like, all remaining text is added as result[count] rather than tossed
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
String.prototype.startswith = function(prefixes) {
	// Accepts a list of prefixes - can include regex
	if (typeof prefixes === "string")
		prefixes = [prefixes]
	for (const prefix of prefixes) {
		if (prefix instanceof RegExp) {
			const match = prefix.exec(this)
			if (match && match.index == 0)
				return true
		} else if (this.startsWith(prefix))
			return true
	}
	return false
}

const toolbox = {}

toolbox.EventEmitter = function() {
	this.callbacks = {}
}
toolbox.EventEmitter.prototype.on = function(event_name, callback) {
	if (!this.callbacks[event_name]) this.callbacks[event_name] = []
	this.callbacks[event_name].push(callback)
	return this // chainable
}
toolbox.EventEmitter.prototype.emit = function(event_name, data) {
	this._dispatch(event_name, data)
	return this
}
toolbox.EventEmitter.prototype._dispatch = function(event_name, data) {
	let events = this.callbacks[event_name]
	if(!events) return
	events.forEach(e => e(data))
}
toolbox.EventEmitter.prototype.resetevents = function() {
	this.callbacks = {}
}

// Stringify for display, protect against circular refs
toolbox.stringify_display = (obj, replacer, spaces) => JSON.stringify(obj, _serializer(replacer), spaces)
function _serializer(replacer) {
	var stack = []
	return function(key, value) {
		if (stack.length > 0) {
			var pos = stack.indexOf(this)
			pos !== -1 ? stack.splice(pos + 1) : stack.push(this)
			if (stack.includes(value)) value = "[Circular ref]"
		} else stack.push(value)
		return replacer == null ? value : replacer.call(this, key, value)
	}
}

toolbox.arr2obj = function(arr, value) {
	// value can be a single value for each item, or a function with the same signature
	//  as reduce (obj, key, idx), but returns the value instead of the final object
	return arr.reduce((obj, key, idx) => {
		obj[key] = typeof value === 'function' ? value(obj, key, idx) : value
		return obj
	}, {})
}

toolbox.process_object = function(obj, filter, mapper) {
	// 'filter' function receives one 'entry' argument, return true/false
	// 'mapper' function receives one 'entry' argument, returns [key, value]
	// Leave either empty as you need
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
	if (arguments.length == 1) {
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

// IDEA: jskodi
toolbox.imageencode = image => image.startswith('image://') ? image : 'image://' + encodeURIComponent(image) + '/'
toolbox.imagedecode = image => decodeURIComponent(image.slice(8, -1))

toolbox.Connection = function(host, wsport='9090') {
	if (typeof host === 'string')
		host = new URL(host)
	if (host.protocol !== 'http:' && host.protocol !== 'https:')
		throw new Error("Host must be HTTP or HTTPS")
	toolbox.EventEmitter.call(this)
	this.host = host.origin
	const secure = host.protocol === 'https:'
	this.wsurl = (secure ? 'wss://' : 'ws://') + host.hostname + ':' + wsport
	this.nextid = 0
	this.openmethods = {}
	this.notifications = {}
	this.methods = {}
	this.reftypes = {}
	this.socket
	this.interval
	this.name
}
toolbox.Connection.prototype = new toolbox.EventEmitter()
toolbox.Connection.prototype.connected = function() {
	return this.socket && this.socket.readyState === WebSocket.OPEN
}
toolbox.Connection.prototype.connect = function() {
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
		this.socket.onopen = () => {
			console.log('connection opened')
			this._prepare().then(() => this.emit('statuschange', {connected: true})).then(() => resolve(this))
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
				this.emit('notification', {data,
					description: this.notifications[data.method] && this.notifications[data.method].description})
			} else if (!(data.id in this.openmethods))
				console.log('Unhandled message', data)
		}
		this.interval = setInterval(() => {
			if (this.connected()) {
				const t0 = performance.now()
				this.ping().then(() => this.emit('pingtime', {time: (performance.now() - t0).toFixed(1)}))
				.catch(() => {
					this.disconnect(false)
					this.connect()
				})
			} else if (this.socket.readyState === WebSocket.CLOSED) {
				console.log('no connection, trying to reconnect')
				this.disconnect(false)
				this.connect().then(() => resolve(this))
			}
		}, 15000)
	})
}
toolbox.Connection.prototype.disconnect = function(removelisteners=true) {
	if (removelisteners)
		this.resetevents()
	if (!this.socket)
		return
	clearInterval(this.interval)
	this.socket.onclose = null
	this.socket.close()
	this.socket = null
}
toolbox.Connection.prototype.call = function(method, params) {
	return new Promise((resolve, reject) => {
		if (!this.connected()) {
			const err = new Error("No websocket connection available")
			err.code = 'no-connection'
			reject(err)
			return
		}
		const id = this.nextid++
		this.openmethods[id] = {method, params}
		const timeout = setTimeout(() => {
			delete this.openmethods[id]
			this.socket.removeEventListener('message', handlethismessage)
			const err = new Error("Method call timed out after 30s")
			err.code = 'timeout'
			reject(err)
		}, 30000)
		const handlethismessage = event => {
			if (!event.data) return
			try {
				var data = JSON.parse(event.data)
			} catch (e) { return }
			if (data.id !== id) return
			delete this.openmethods[id]
			this.socket.removeEventListener('message', handlethismessage)
			clearTimeout(timeout)
			if (data.result)
				resolve(data.result)
			else
				reject(data.error || {code: 'no-result'})
		}
		this.socket.addEventListener('message', handlethismessage)
		this.socket.send(JSON.stringify({jsonrpc: '2.0', method, params, id}))
	})
}
toolbox.Connection.prototype._prepare = function() {
	return this.call('Application.GetProperties', {properties: ['name', 'version']}).then(data => {
		this.name = data.name + ' ' + data.version.major + '.' + data.version.minor
		if (data.version.tag !== 'stable')
			this.name += ' ' + data.version.tag
	}).then(() => this.call('XBMC.GetInfoLabels', {labels: ['System.FriendlyName']}))
	.then(data => data['System.FriendlyName']).then(data => {
		if (data.startsWith('Kodi (') && data.endsWith(')'))
			data = data.slice(6, -1)
		this.name += ' on ' + data
	})
}
toolbox.Connection.prototype.populatedata = function() {
	const args = {getmetadata: true}
	return this.call('JSONRPC.Introspect', args).then(data => {
		if (data.notifications)
			this.notifications = data.notifications
		if (data.types)
			this.reftypes = dereference(extend(data.types), data.types)
		if (data.methods)
			this.methods = Object.entries(data.methods).reduce((result, entry) => {
				result[entry[0]] = entry[1].description
				return result
			}, {})
		return data
	})
}
toolbox.Connection.prototype.introspect = function(methodname) {
	if (!methodname)
		return Promise.reject(new Error('methodname is required'))
	const args = {getdescriptions: true, getmetadata: true, filterbytransport: false,
		filter: {'getreferences': false, 'id': methodname, type: 'method'}}
	return this.call('JSONRPC.Introspect', args).then(data => {
		dereference(data.methods[methodname], this.reftypes)
		return data
	})
}
toolbox.Connection.prototype.get_infos = function(infos, booleans=false) {
	if (!infos) return Promise.resolve({})
	// Kodi doesn't like requests > 1024 bytes
	const method = !booleans ? 'XBMC.GetInfoLabels' : 'XBMC.GetInfoBooleans'
	const list = infos.reduce((result, item) => {
		if (result.length && result[result.length - 1].join('","').length + item.length < 940)
			result[result.length - 1].push(item)
		else
			result.push([item])
		return result
	}, [])
	return list.reduce((promise, shortlist) => promise.then(result => {
		return this.call(method, [shortlist]).then(data => Object.assign(result, data))
	}), Promise.resolve({}))
}
toolbox.Connection.prototype.ping = function() {
	return this.call('JSONRPC.Ping')
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
