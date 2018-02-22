'use strict'

const $ = (selector, context=document) => context.querySelector(selector)
const $ls = (selector, context=document) => context.querySelectorAll(selector)

$.clone = (node, istemplate=true) => (istemplate ? node.content : node).cloneNode(true)

// Edge polyfills. Still doesn't completely work, though
if (!HTMLCollection.prototype[Symbol.iterator])
	HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator]
if (!NodeList.prototype[Symbol.iterator])
	NodeList.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator]

/** Stringify for display, protect against circular refs */
const stringify_display = (obj, replacer, spaces) => JSON.stringify(obj, _serializer(replacer), spaces)
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

const UI = {}
toolbox.EventEmitter.call(UI)
UI.__proto__ = new toolbox.EventEmitter()

const firsttheme = $('link.themesheet')
const runningbutton = $('#running-button-js')
const logbutton = $('#log-button-js')
const webpdbbutton = $('#webpdb-button-js')
const logdesc = $('#log-desc-js')
const webpdbdesc = $('#webpdb-desc-js')

runningbutton.addEventListener('click', () => hashman.set('!RunningData'))
UI.set_isrunning = function(isrunning) {
	runningbutton.children[0].classList.toggle('forever-rotate', isrunning)
}

UI.hidesplash = function() {
	const splash = $('#splash-js')
	splash.addEventListener('transitionend', () => {
		splash.remove()
	})
	splash.offsetWidth // make sure it's drawn so there is actually a transition
	splash.classList.add('fadeout')
}

UI.set_subtitle = function(subtitle) {
	$('#subtitle-js').innerText = subtitle
}

$('#theme-switcher-js').addEventListener('click', () => {
	let nextlink = false
	for (let link of $ls('link.themesheet')) {
		if (nextlink) {
			UI.set_theme(link.title)
			UI.emit('themechange', link.title)
			return
		}
		if (!link.disabled)
			nextlink = true
	}
	const newtheme = firsttheme.title
	UI.set_theme(newtheme)
	UI.emit('themechange', newtheme)
})
UI.set_theme = function(themename) {
	let oneenabled = false
	$ls('link.themesheet').forEach(link => {
		link.disabled = true
		if (link.title === themename) {
			link.disabled = false
			oneenabled = true
		}
	})
	if (!oneenabled) firsttheme.disabled = false
}

UI.show_logbutton = function(visible=true) {
	logbutton.classList.toggle('nodisplay', !visible)
	logdesc.classList.toggle('nodisplay', !visible)
}
UI.show_pdbbutton = function(visible=true) {
	webpdbbutton.classList.toggle('nodisplay', !visible)
	webpdbdesc.classList.toggle('nodisplay', !visible)
}

// connectionbox
const connection_template = $('#connection-template')
const shortcontent = $('#conbox-shortcontent-js')
const content = $('#conbox-content-js')
const conboxbutton = $('#conbox-button-js')
const allconnections = $('#conbox-allconnections')
const connection_input = $('input[name=host]')
function getconnection(host) {
	for (let li of $ls('li', allconnections)) {
		if (li.dataset.host === host)
			return li
	}
}
UI.set_connection = function(name, host) {
	shortcontent.textContent = name
	UI.imageurl_base = host + '/image/'
	logbutton.href = host + "/vfs/special%3A%2F%2Flogpath%2Fkodi.log"
	logbutton.target = host
	webpdbbutton.href = host + ":5555"
	$ls('.connection-li', allconnections).forEach(li => {
		li.classList.toggle('selected', li.children[0].textContent === name)
		if (li.children[0].textContent === name) {
			shortcontent.title = li.dataset.host
			shortcontent.dataset.host = li.dataset.host
			$('i', li).title = 'Disconnect host'
		} else
			$('i', li).title = 'Delete host'
	})
}
UI.set_hostping = function(ping) {
	shortcontent.title = shortcontent.dataset.host + ` ${ping}ms`
}
UI.set_connectionstatus = function(connected) {
	conboxbutton.classList.toggle('connected', connected)
}
UI.add_connection = function(host, displayname) {
	var li = getconnection(host)
	if (!li) {
		const clone = $.clone(connection_template)
		li = clone.children[0]
		li.addEventListener('click', e => {
			if (e.defaultPrevented) return
			UI.emit('selecthost', host)
		})
		li.children[1].addEventListener('click', e => {
			e.preventDefault()
			if (e.target.parentNode.classList.contains('selected')) {
				UI.emit('disconnect')
			} else {
				allconnections.removeChild(li)
				UI.emit('removehost', host)
			}
		})
		allconnections.appendChild(clone)
		li.dataset.host = host
		li.title = host
	}
	li.children[0].textContent = displayname
}
let conbox_open = false
conboxbutton.addEventListener('click', () => {
	const expand = !conbox_open
	content.style.display = expand ? 'block' : 'none'
	conboxbutton.children[0].classList.toggle('rotate', expand)
	if (expand)
		connection_input.focus()
	conbox_open = expand
})
connection_input.addEventListener('keyup', e => {
	if (e.keyCode !== 13)
		return
	UI.emit('addhost', e.target.value)
	e.target.value = ''
})

// methodlist
const methodtemplate = $('#method-template')
const namespacetemplate = $('#namespace-template')
const methodsearch = $('#method-search-js')
const methodlist = $('#method-list-js')
const methodlist_toggle = $('#methodlist-toggle-button-js')

methodlist_toggle.addEventListener('click', () => {
	methodlist.parentNode.classList.toggle('nodisplay')
	methodlist_toggle.children[0].classList.toggle('rotate50')
})
methodlist.filtered = ''
methodsearch.addEventListener('keyup', e => {
	if (e.keyCode === 13)
		return
	const filter = methodsearch.value.toLowerCase()
	if (filter === methodlist.filtered)
		return
	methodlist.filtered = filter
	let lastnamespace
	for (let li of $ls('li', methodlist)) {
		if (li.classList.contains('namespace-li-js')) {
			if (lastnamespace)
				lastnamespace.classList.add('nodisplay')
			lastnamespace = li
			continue
		}
		if (!filter) {
			if (lastnamespace) {
				lastnamespace.classList.remove('nodisplay')
				lastnamespace = null
			}
			li.classList.add('nodisplay')
			continue
		}
		const name = li.dataset.namespace.toLowerCase() + '.' + li.firstElementChild.textContent.toLowerCase()
		const visible = name.includes(filter)
		li.classList.toggle('nodisplay', !visible)
		if (lastnamespace) {
			lastnamespace.classList.toggle('nodisplay', !visible)
			if (visible)
				lastnamespace = null
		}
	}
})
methodlist.get_namespace = function(namespace) {
	for (let li of $ls('li', this)) {
		if (li.matches('.namespace-li-js') && li.firstElementChild.textContent === namespace)
			return li
	}
}
UI.set_methodlist = function(methods) {
	methodlist.innerHTML = ''
	Object.entries(methods).forEach(([name, description]) => {
		let [namespace, method] = name.split('.', 2)
		if (!methodlist.get_namespace(namespace)) {
			let clone = $.clone(namespacetemplate)
			let thing = clone.firstElementChild.firstElementChild
			thing.textContent = namespace
			thing.href = '#/' + namespace
			thing.onclick = e => {
				if (location.hash === '#/' + namespace) {
					location.hash = '#/'
					e.preventDefault()
				}
			}
			methodlist.appendChild(clone)
		}
		let clone = $.clone(methodtemplate)
		clone.firstElementChild.dataset.namespace = namespace
		let thing = clone.firstElementChild.firstElementChild
		thing.textContent = method
		thing.href = '#/' + name
		if (description)
			thing.title = description
		methodlist.appendChild(clone)
	})
}
UI.focus_namespace = function(namespace) {
	methodsearch.value = ''
	for (let li of $ls('li', methodlist)) {
		if (!li.classList.contains('namespace-li-js'))
			li.classList.toggle('nodisplay', li.dataset.namespace !== namespace)
	}
}

// contentbox
const notification_template = $('#notification-template')
const output_template = $('#output-template')
const previewpre_template = $('#preview-pre-template')
const previewimg_template = $('#preview-img-template')
const runningdata_template = $('#runningdata-template')
const runningdata_section_template = $('#runningdata-section-template')
const runningdata_li_template = $('#runningdata-li-template')
const contentbox = $('#content-js')
const notificationsbox = $('#notifications-js')
const preview = $('#preview-js')

let notificationspaused = false
$('#notification-pause-js').addEventListener('click', e => {
	notificationspaused = !notificationspaused
	e.target.classList.toggle('notifications-paused', notificationspaused)
	e.target.childNodes[0].textContent = notificationspaused ? 'notifications_paused' : 'notifications'
})

function attach_popout(element, info) {
	element.addEventListener('click', e => {
		UI.set_popoutinfo(element, info)
		e.stopPropagation()
	})
	element.addEventListener('mouseover', () => {
		UI.set_popoutinfo(element, info, true)
	})
	element.addEventListener('mouseout', () => {
		UI.set_popoutinfo(element, undefined, true)
	})
}
function inline_images(container, string) {
	const innerHTML = string.replace(/image:\/\/[^""]*/g, imageurl => {
		const shorturl = imageurl.length >= 60 ? imageurl.substring(0, 59) + '…' : imageurl
		return `<span class="has-popoutinfo inline-popout popoutinfo-js" data-popoutinfo="${imageurl}">${shorturl}</span>`
	})
	container.innerHTML = innerHTML
	$ls('.popoutinfo-js', container).forEach(elem => {
		attach_popout(elem, elem.dataset.popoutinfo || elem.textContent)
	})
}

UI.set_popoutinfo = function(elem, info, hovered) {
	if (hovered && !info && (UI.currentpopout_elem !== elem || elem.classList.contains('selected')))
		return
	if (hovered && info && UI.currentpopout_elem)
		return
	if (UI.currentpopout_elem)
		UI.currentpopout_elem.classList.remove('selected')
	UI.currentpopout_elem = info ? elem : undefined
	if (elem && !hovered)
		elem.classList.add('selected')
	preview.innerHTML = ''
	if (info && info.startsWith('image://')) {
		const clone = $.clone(previewimg_template)
		clone.children[0].textContent = toolbox.imagedecode(info)
		clone.children[1].src = UI.imageurl_base + encodeURIComponent(info)
		preview.appendChild(clone)
	} else if (info) {
		const clone = $.clone(previewpre_template)
		clone.children[0].textContent = info
		preview.appendChild(clone)
	}
}
UI.add_notification = function(description, method, sender, data) {
	if (notificationspaused)
		return
	const clone = $.clone(notification_template)
	let children = $ls('.data-js', clone)
	children[0].textContent = method + ' from ' + sender
	children[0].title = description
	children[1].textContent = JSON.stringify(data, undefined, 2)
	children[1].title = new Date()
	notificationsbox.insertBefore(clone, notificationsbox.firstChild)
	notificationsbox.scrollTop = 0
	while (notificationsbox.children.length > 50) {
		notificationsbox.removeChild(notificationsbox.lastElementChild)
	}
}
let runningdata_box
let runningdatahelp
let runningping
let cbdata = {}
UI.add_runningsection = function(name, label) {
	if (!runningdata_box) {
		// TODO: I don't like runningdata as a template, it should be an existing section of content
		//  that is just hidden
		runningdata_box = $.clone(runningdata_template).children[0]
		contentbox.innerHTML = ''
		contentbox.appendChild(runningdata_box)
		runningdata_box.addEventListener('click', () => UI.set_popoutinfo())
		UI.currentmethod = ''
		runningdatahelp = $('#runningdata-help-js')
		runningping = $('#runningdata-ping-js')
		runningping.addEventListener('click', () => UI.emit('togglerunningspeed'))
		
		$('#detailedart-js').classList.toggle('nodisplay', !appdata.show_allart)
		$('#no-detailedart-js').classList.toggle('nodisplay', appdata.show_allart)
	}
	const infobox = $.clone(runningdata_section_template)
	infobox.children[0].classList.add(name + '-js')
	infobox.children[0].children[0].textContent = label
	infobox.children[0].children[1].name = name
	runningdata_box.appendChild(infobox)
}
UI.set_runningping = function(ping) {
	if (runningping)
		runningping.innerText = `${ping}ms`
}
UI.set_pingspeed = function(runningspeed) {
	if (runningping) {
		runningping.classList.toggle('fast', runningspeed === 200)
		runningping.classList.toggle('supafast', runningspeed === 0)
	}
}
UI.set_runningdata = function(key, obj, type) {
	// type = 'popupinfo' or 'justkey'
	if (!key) {
		runningdatahelp.classList.remove('nodisplay')
		if (runningping) runningping.classList.add('nodisplay')
		cbdata = {}
		return
	}
	if (toolbox.has_samedata(obj, cbdata[key]))
		return
	cbdata[key] = obj

	const infobox = $(`.${key}-js`, runningdata_box)
	if (!obj) {
		infobox.classList.add('nodisplay')
		if (Object.values(cbdata).every(val => !val)) {
			runningdatahelp.classList.remove('nodisplay')
			if (runningping) runningping.classList.add('nodisplay')
		}
		return
	}
	runningdatahelp.classList.add('nodisplay')
	runningping.classList.remove('nodisplay')
	const ul = infobox.children[1]
	infobox.classList.remove('nodisplay')
	// TODO: Instead of wiping, reuse the listitem, even diff each one, as they will generally have the same keys
	//  in the same order
	ul.innerHTML = ''
	for (const [label, info] of Object.entries(obj)) {
		const clone = $.clone(runningdata_li_template)
		const children = clone.children[0].children
		children[0].textContent = label
		if (type === 'popupinfo') {
			clone.children[0].classList.add('has-popoutinfo')
			attach_popout(clone.children[0], info)
		}
		if (!['justkey', 'popupinfo'].includes(type)) {
			children[1].textContent = ' ' + info.replace(/\n/g, ' // ')
			children[0].classList.add('has-value')
		}
		ul.appendChild(clone)
	}
}
UI.set_result = function(title, data, type) {
	if (runningdata_box) {
		runningdata_box = null
		cbdata = {}
	}
	const clone = $.clone(output_template)
	clone.children[0].addEventListener('click', () => UI.set_popoutinfo())
	let children = $ls('.data-js', clone)
	if (['result', 'error'].includes(type))
		title = '<i class="material-icons">file_download</i> ' + title
	else if (type === 'calling')
		title = '<i class="material-icons">file_upload</i> ' + title
	children[0].innerHTML = title
	if (['result', 'calling'].includes(type)) {
		children[0].classList.add('has-popoutinfo')
		attach_popout(children[0], data[1])
		data = data[0]
	}
	try {
		inline_images(children[1], stringify_display(data, undefined, 2))
	} catch (TypeError) {
		console.log(data)
	}
	children[1].title = new Date()
	if (type === 'definition')
		contentbox.innerHTML = ''
	contentbox.insertBefore(clone, contentbox.firstElementChild)
	contentbox.scrollTop = 0
	while (contentbox.children.length > 10) {
		contentbox.removeChild(contentbox.lastElementChild)
	}
}

// executionbox
const param_template = $('#param-template')
const parambool_template = $('#param-bool-template')
const paramselect_template = $('#param-select-template')
const methodtitle = $('#method-title-js')
const paramslist = $('#params-list-js')
const paramsform = $('form[name=params-form]')
const executebutton = $('#execute-button-js')
const filterbutton = $('#filter-button-js')
const customlabels = $('#custom-infolabels-js')
const custombooleans = $('#custom-infobooleans-js')

$('#execution-container-js').addEventListener('click', () => UI.set_popoutinfo())

const custominput = e => UI.emit('setcustominfo',
	{[e.target === customlabels ? 'labels' : 'booleans']: e.target.value.split('\n')})
const customenter = e => e.code === 'Enter' && custominput(e)
customlabels.addEventListener('change', custominput)
customlabels.addEventListener('keyup', customenter)
custombooleans.addEventListener('change', custominput)
custombooleans.addEventListener('keyup', customenter)

UI.currentmethod = ''
const ExecutionToolbox = {
	isfiltered: false,
	addparam: function(param, tabindex, popoutinfo, label) {
		if (typeof param.type !== 'string' && param.type.length === 2 && param.type[0].type === 'null') {
			if (Object.keys(param.type[1]).length === 1)
				param.type = param.type[1].type
			else
				param.type = param.type[1]
		}
		// This is getting painful
		const typeinfo = typeof param.type === 'string' ? param : param.type
		if (Array.isArray(typeinfo) && typeinfo.every(p => p.enums)) {
			typeinfo.type = 'string'
			typeinfo.enums = [].concat(...typeinfo.map(t => t.enums))
		}
		if (typeinfo.type == 'string' && typeinfo.enums && typeinfo.enums.length > 5)
			typeinfo.type = 'select'
		// TODO: other param styles
		// id: "List.Limits" needs some special lovin to display two inputs but work with 1 param
		// Player.Zoom has 2 item enum plus integer 1 through 10, maybe a good idea for select
		let template
		if (typeinfo.type === 'bool') // 'bool' is special for runningdata, just on/off
			template = parambool_template
		else if (typeinfo.type === 'select')
			template = paramselect_template
		else
			template = param_template
		const clone = $.clone(template)
		const li = clone.children[0]
		const labelE = clone.children[0].children[0].children[0]
		const input = clone.children[0].children[0].children[1]
		if (popoutinfo) {
			const showpreview = (e) => {
				UI.set_popoutinfo(li, popoutinfo)
				input.focus()
				e.stopPropagation()
			}
			li.addEventListener('click', showpreview)
			li.addEventListener('focusin', showpreview)
			li.addEventListener('mouseover', () => UI.set_popoutinfo(li, popoutinfo, true))
			li.addEventListener('mouseout', () => UI.set_popoutinfo(li, undefined, true))
		} else
			li.classList.remove('has-popoutinfo')

		labelE.textContent = label || param.name
		input.name = param.name
		if (typeinfo.type === 'boolean') {
			this.prepare_toggler(input, li, ['true', 'false'], param.required)
		} else if (['integer', 'number'].includes(typeinfo.type)) {
			if (typeinfo.type === 'integer' && 'minimum' in param && 'maximum' in param
			&& param.maximum - param.minimum <= 5) {
				const options = toolbox.range(param.minimum, param.maximum + 1).map(n => '' + n)
				this.prepare_toggler(input, li, options, param.required)
			} else {
				input.type = 'number'
				if ('minimum' in param)
					input.min = param.minimum
				if ('maximum' in param)
					input.max = param.maximum
				if (typeinfo.type === 'number')
					input.step = 'any'
			}
		} else if (param.id === 'Global.Toggle') {
			const options = ['true', 'false', 'toggle']
			this.prepare_toggler(input, li, options, param.required)
		} else if (typeinfo.type == 'string' && typeinfo.enums) {
			this.prepare_toggler(input, li, [...typeinfo.enums], param.required)
		} else if (typeinfo.type == 'select') {
			const options = typeinfo.enums.sort()
			if (!param.required && !options.includes(''))
				options.unshift('')
			options.forEach(opt => input.options[input.options.length] = new Option(opt))
		} else if (typeinfo.length === 2 && typeinfo[0].type === 'boolean' && typeinfo[1].type === 'string'
		&& typeinfo[1].enums && typeinfo[1].enums.length <= 3) {
			// awkward. Seems to be just Addons.GetAddons 'enabled' and 'installed' params, no simpler way to ID it
			const options = ['true', 'false', ...typeinfo[1].enums]
			this.prepare_toggler(input, li, options, param.required)
		} else if (param.id === 'List.Limits') {
			const options = ['{"end": 10}', '{"start": 10, "end": 20}', '{"end": 20}']
			this.prepare_switcher(input, li, options, param.required)
		} else if (param.id === 'List.Sort') {
			const options = ['{"method": "random"}', '{"method": "dateadded", "order": "descending"}',
				'{"method": "label", "ignorearticle": true}']
			this.prepare_switcher(input, li, options, param.required)
			input.style.width = '200px'
		} else if (typeinfo.type === 'array' && param.items && param.items.enums) {
			const options = []
			options.push(JSON.stringify([param.items.enums[0]]))
			if (param.items.enums.length > 2 && param.items.enums.includes('art')
			&& !param.items.enums.slice(0, 2).includes('art'))
				options.push('["art"]')
			if (param.items.enums.length > 1)
				options.push(JSON.stringify([param.items.enums[0], param.items.enums[1]]))
			if (param.items.enums.length > 2)
				options.push(JSON.stringify(param.items.enums))
			this.prepare_switcher(input, li, options, param.required)
			if (typeinfo.name == 'properties')
				input.style.width = '200px'
		} else if (param.name === 'filter')
			input.style.width = '200px'

		if (param.required)
			input.required = true
		if (tabindex)
			input.tabIndex = tabindex
		paramslist.appendChild(clone)
		if (tabindex === 1)
			input.focus()
		return input
	},
	prepare_toggler: function(input, parent, options, required) {
		if (!required && !options.includes(''))
			options.push('')
		// input.readOnly = true // Bah! validation ignores readOnly, so workaroundit!
		input.dataset.readonly = true
		input.classList.add('toggler')
		const rotate = () => input.value = options[(options.indexOf(input.value) + 1) % options.length]
		input.addEventListener('keydown', e => {
			if (e.key.length === 1)
				e.preventDefault()
			if (e.key === ' ')
				rotate()
		})
		parent.title = 'Click to toggle'
		parent.addEventListener('click', e => {
			if (!e.defaultPrevented)
				rotate()
			e.preventDefault()
		})
	},
	prepare_switcher: function(input, parent, options, required) {
		if (!required && !options.includes(''))
			options.push('')
		const rotate = () => input.value = options[(options.indexOf(input.value) + 1) % options.length]
		const switcher = $('.switcher-js', parent)
		switcher.addEventListener('click', e => {
			rotate()
			e.preventDefault()
		})
		switcher.classList.remove('nodisplay')
	}
}
UI.set_method = function(name, method) {
	UI.currentmethod = name
	executebutton.classList.remove('nodisplay')
	filterbutton.classList.add('nodisplay')
	methodtitle.children[0].textContent = name
	if (!method) return
	if (method.description)
		methodtitle.children[1].textContent = ' ' + method.description
	paramslist.innerHTML = ''
	let count = 0
	for (let param of method.params) {
		count += 1
		ExecutionToolbox.addparam(param, count, stringify_display(param, undefined, 2))
	}
	executebutton.tabIndex = count + 1
}
function input_setvalue(input, value='') {
	if (input.type === 'checkbox')
		input.checked = value === 'true'
	else
		input.value = value
}
ExecutionToolbox.filterparams = function(forced=null) {
	ExecutionToolbox.isfiltered = forced === null ? !ExecutionToolbox.isfiltered : forced
	for (const li of $ls('li', paramslist)) {
		const hidden = !li.children[0].children[1].checked && ExecutionToolbox.isfiltered
			&& li.dataset.forcedvisible !== 'true'
		li.classList.toggle('nodisplay', hidden)
		if (hidden)
			UI.emit('set_runningparam', {param: li.children[0].children[1].name, visible: false})
	}
}
UI.update_params = function(params) {
	for (const li of $ls('li', paramslist)) {
		let found = false
		const input = li.children[0].children[1]
		for (const [key, value] of Object.entries(params)) {
			if (input.name === key) {
				input_setvalue(input, value)
				found = true
				break
			}
		}
		if (!found)
			input_setvalue(input)
	}
	customlabels.parentNode.classList.toggle('nodisplay',
		!Object.keys(params).some(key => key === 'customlabels'))
	custombooleans.parentNode.classList.toggle('nodisplay',
		!Object.keys(params).some(key => key === 'custombooleans'))
}
paramsform.addEventListener('submit', e => {
	e.preventDefault()
	if (!UI.currentmethod)
		return
	let params = {}
	for (let [k, v] of new FormData(e.target)) {
		if (v) params[k] = v
	}
	UI.emit('executemethod', {method: UI.currentmethod, params})
})
filterbutton.addEventListener('click', () => ExecutionToolbox.filterparams())
UI.set_runningsections = function(params) {
	executebutton.classList.add('nodisplay')
	filterbutton.classList.remove('nodisplay')
	methodtitle.children[0].textContent = ''
	methodtitle.children[1].textContent = ''
	paramslist.innerHTML = ''
	let count = 0
	for (let param of params) {
		count += 1
		const checkbox = ExecutionToolbox.addparam({name: param[0], type: 'bool'}, count, undefined, param[1])
		checkbox.addEventListener('change', _ => {
			UI.emit('set_runningparam', {param: param[0], visible: checkbox.checked})
			if (param[0].startsWith('custom')) {
				if (param[0].endsWith('labels'))
					customlabels.parentNode.classList.toggle('nodisplay', !checkbox.checked)
				else
					custombooleans.parentNode.classList.toggle('nodisplay', !checkbox.checked)
			}
		})
		checkbox.parentNode.parentNode.dataset.forcedvisible = param[2]
		UI.add_runningsection(param[0], param[1])
	}
	customlabels.tabIndex = ++count
	custombooleans.tabIndex = ++count
}
UI.set_custominfo_options = function(labels, booleans) {
	if (labels)
		customlabels.value = labels.join('\n')
	if (booleans)
		custombooleans.value = booleans.join('\n')
}
