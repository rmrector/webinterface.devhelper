'use strict'

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

toolbox.EventEmitter = object => {
	let callbacks = {}
	Object.assign(object, {
		on(event_name, callback) {
			if (!callbacks[event_name]) callbacks[event_name] = []
			callbacks[event_name].push(callback)
		},
		off(event_name, callback=null) {
			if (!callback) {
				callbacks[event_name] = []
				return
			}
			if (callbacks[event_name] && callbacks[event_name].length)
				callbacks[event_name] = callbacks[event_name].filter(cb => cb !== callback)
		},
		emit(event_name, ...data) {
			if(!callbacks[event_name]) return
			callbacks[event_name].forEach(e => e(...data))
		},
		resetevents() {
			callbacks = {}
		}
	})
	return object
}

/**
 * Turn an array into an object, value to keys
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
	if (!(filter || mapper)) return obj
	return Object.entries(obj).filter(entry => filter ? filter(entry) : true)
	.reduce((result, entry) => {
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

toolbox.randomitem = (list, odds=0) => list[Math.floor(Math.random() * list.length * (1 + odds))]

const _pipe = (f1, f2) => (...args) => f2(f1(...args))
const pipe = (...fns) => fns.reduce(_pipe)
toolbox.pipe = pipe

const set = list => new Set(list)
toolbox.uniquelist = pipe(set, Array.from)

toolbox.sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const compare = {}
compare.natural = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare
compare.reverse = compare => (a, b) => compare(b, a)

compare.onkey = (compare, key) => (a, b) => compare(a[key], b[key])

compare.natural_key = key => compare.onkey(compare.natural, key)
