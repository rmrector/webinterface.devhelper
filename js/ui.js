'use strict'

const $ = (selector, context=document) => context.querySelector(selector)
const $ls = (selector, context=document) => Array.from(context.querySelectorAll(selector))

$.clone = (node, istemplate=true) => (istemplate ? node.content : node).cloneNode(true)

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
toolbox.EventEmitter(UI)

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
UI.set_connection = function(name) {
	shortcontent.textContent = name
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
const methodsearchclear = $('#method-search-clear-js')
const methodlist = $('#method-list-js')
const methodlist_toggle = $('#methodlist-toggle-button-js')

methodlist_toggle.addEventListener('click', () => {
	methodlist.parentNode.classList.toggle('nodisplay')
	methodlist_toggle.children[0].classList.toggle('flip')
})
methodlist.filtered = ''
methodsearch.addEventListener('keyup', e => {
	if (e.keyCode === 13) // Enter key
		return
	const filter = methodsearch.value.toLowerCase()
	if (filter === methodlist.filtered)
		return
	methodlist.filter(filter)
})
methodsearchclear.addEventListener('click', () => {
	methodsearch.value = ''
	methodlist.filter('')
})
methodlist.filter = function(filter) {
	methodlist.filtered = filter
	let lastnamespace
	for (let li of $ls('li', methodlist)) {
		if (li.classList.contains('namespace-li-js')) {
			if (lastnamespace)
				lastnamespace.classList.add('nodisplay')
			lastnamespace = li
			continue
		} // beyond is for method LIs
		if (!filter) {
			if (lastnamespace) {
				lastnamespace.classList.remove('nodisplay')
				lastnamespace = null
			}
			if (appdata.currentaction && !appdata.currentaction.startsWith(li.dataset.namespace))
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
	methodsearchclear.classList.toggle('nodisplay', !filter)
}
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
	if (methodlist.filtered)
		return
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
function build_preview(container) {
	// inline image previews and shortens long strings from renderJSON
	// doesn't work on image URLs that are lazy rendered
	$ls('.string', container).forEach(elem => {
		if (/^"image:\/\//.test(elem.textContent) ||
				elem.textContent.length > 60 && elem.textContent.startsWith('"')) {
			const content = elem.textContent.slice(1, elem.textContent.length - 1)
			const shortcontent = content.length >= 60 ? content.substring(0, 59) + '…' : content
			elem.textContent = `"${shortcontent}"`
			elem.classList.add('has-popoutinfo', 'inline-popout', 'popoutinfo-js')
			elem.dataset.popoutinfo = content
			attach_popout(elem, content)
		}
	})
	return container
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
		clone.children[0].textContent = jskodi.imagedecode(info)
		clone.children[1].src = appstate.shared.connection.host + '/image/' + encodeURIComponent(info)
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
		runningping.classList.toggle('fast', runningspeed && runningspeed < 1000)
		runningping.classList.toggle('supafast', runningspeed === 0)
		runningping.classList.toggle('slow', runningspeed > 1000)
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
			children[1].innerHTML = ' ' + info.replace(/\n/g, '<br>')
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
	if (['result', 'error', 'calling'].includes(type)) {
		const icon = type === 'calling' ? 'file_upload' : type === 'result' ? 'file_download' : 'error'
		title = `<i class="material-icons">${icon}</i> ${title}`
		children[0].classList.add('has-popoutinfo')
		attach_popout(children[0], data[1])
		data = data[0]
	}
	children[0].innerHTML = title
	const render_level = appstate.getters.renderJSON_level()
	if (render_level == 2)
		children[1].appendChild(renderjson(data))
	else if (render_level == 1)
		children[1].appendChild(build_preview(renderjson(data)))
	else
		inline_images(children[1], stringify_display(data, undefined, 2))
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
const customlabels = $('#customlabels-js')
const custombooleans = $('#custombooleans-js')

$('#execution-container-js').addEventListener('click', () => UI.set_popoutinfo())

const custominput = customtype => e =>
	UI.emit('setcustominfo', {[customtype]: e.target.value.split('\n')})
const customenter = customtype => e => e.code === 'Enter' && custominput(customtype)(e)

customlabels.addEventListener('change', custominput('labels'))
customlabels.addEventListener('keyup', customenter('labels'))
custombooleans.addEventListener('change', custominput('booleans'))
custombooleans.addEventListener('keyup', customenter('booleans'))

UI.currentmethod = ''
const ExecutionToolbox = {
	isfiltered: false,
	get_param_uidef: function(param) {
		const uidef = {id: param.id, name: param.name, required: param.required,
			min: param.minimum, maximum: param.maximum}

		if (param.name === 'filter') {
			uidef.width = '300px'
			uidef.type = Array.isArray(param.type) ? param.type : [param]
			return uidef
		}

		// squash limited options to toggles or select
		function reduce_enums(res, newtype) {
			if (res == null)
				return null
			const newenums = 'enums' in newtype ? newtype.enums :
				newtype.type === 'null' ? [''] :
				newtype.type === 'boolean' ? ['true', 'false'] :
				newtype.type === 'integer' && 'minimum' in newtype && 'maximum' in newtype ?
					toolbox.range(newtype.minimum, newtype.maximum + 1).map(String) : null
			if (!newenums) // this type can't be collapsed to enum, continue to prefills
				return null

			return res.concat(newenums)
		}
		const reduce_types = Array.isArray(param.type) ? param.type : [param]
		const reduce_result = reduce_types.reduce(reduce_enums, [])
		if (reduce_result && reduce_result.length) {
			if (!param.required && !reduce_result.includes(''))
				reduce_result.unshift('')
			if (reduce_result.length <= 6)
				uidef.toggles = reduce_result
			else {
				uidef.type = 'select'
				uidef.options = reduce_result.sort(compare.natural)
			}
			return uidef
		}

		// set prefills
		if (uidef.id === 'List.Limits') {
			uidef.prefills = ['', '{"end": 10}', '{"start": 10, "end": 20}', '{"end": 100}']
		} else if (param.id === 'List.Sort') {
			uidef.prefills = ['', '{"method": "random"}', '{"method": "dateadded", "order": "descending"}',
				'{"method": "label", "ignorearticle": true}']
		} else if (param.type === 'array' && param.items && param.items.enums) {
			const enums = param.items.enums
			uidef.prefills = ['', JSON.stringify([enums[0]])]
			if (enums.length > 2 && enums.includes('art') && !enums.slice(0, 2).includes('art'))
				uidef.prefills.push('["art"]')
			if (enums.length > 1)
				uidef.prefills.push(JSON.stringify(enums.slice(0, 2)))
			if (enums.length > 2)
				uidef.prefills.push(JSON.stringify(enums))
		}

		if (uidef.id === 'List.Sort')
			uidef.width = '200px'
		if (uidef.name == 'properties')
			uidef.width = '250px'

		return uidef
	},
	addparam: function(uidef, popoutinfo) {
		let template
		if (uidef.type === 'bool') // 'bool' is special for runningdata, just on/off
			template = parambool_template
		else if (uidef.type === 'select')
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

		labelE.textContent = uidef.label || uidef.name
		input.name = uidef.name
		// TODO: other param styles
		// id: "List.Limits" needs some special lovin to display two inputs but work with 1 param
		// Player.Zoom has 2 item enum plus integer 1 through 10, maybe a good idea for select
		// Fancy filter with three inputs
		// Application.SetVolume, toggle between increment / decrement / integer input?
		if (uidef.toggles) {
			this.prepare_toggler(input, li, uidef.toggles)
		} else if (uidef.prefills) {
			this.prepare_switcher(input, li, uidef.prefills)
		} else if (uidef.type == 'select') {
			uidef.options.forEach(opt => input.options[input.options.length] = new Option(opt))
		} else if (['integer', 'number'].includes(uidef.type)) {
			input.type = 'number'
			if ('min' in uidef)
				input.min = uidef.min
			if ('max' in uidef)
				input.max = uidef.max
			if (uidef.type === 'number')
				input.step = 'any'
		} else if (uidef.name === 'filter') {
			this.add_filter(input, uidef.type, li)
		}
		if (uidef.width)
			input.style.width = uidef.width
		if (uidef.required)
			input.required = true

		paramslist.appendChild(clone)
		return input
	},
	add_filter: function(input, typeinfo, li) {
		const options = []
		const complex = typeinfo.find(type => type.id && type.id.startsWith('List.Filter.'))
		if (complex) {
			const rules = Array.isArray(complex.type) ? complex.type.find(type =>
				type.id && type.id.startsWith('List.Filter.Rule.')).properties : complex.properties
			toolbox.range(4).forEach(() => {
				const field = toolbox.randomitem(rules.field.enums)
				const operator = toolbox.randomitem(rules.operator.enums)
				let option
				if (operator === 'between')
					option = `{"field": "${field}", "operator": "${operator}", "value": ["F", "X"]}`
				else if (['true', 'false'].includes(operator))
					option = `{"field": "${field}", "operator": "${operator}", "value": "${operator}"}`
				else
					option = `{"field": "${field}", "operator": "${operator}", "value": "XX"}`
				if (!options.includes(option))
					options.push(option)
			})
		}
		for (const itype of typeinfo.slice(0, 2)) {
			if (itype.id)
				continue
			let option = {}
			Object.keys(itype.properties).forEach(key => {
				const type = itype.properties[key].type
				option[key] = type === 'string' ? "XX" :
					['integer', 'number'].includes(type) ? 0 : true
			})
			options.push(JSON.stringify(option))
		}
		this.prepare_switcher(input, li, options)
	},
	prepare_toggler: function(input, parent, options) {
		// Flips through a small number of possible values

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
	prepare_switcher: function(input, parent, options) {
		// Flips through a few prefilled options for freeform parameter values (mostly complex objects)
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
	executebutton.focus()
	filterbutton.classList.add('nodisplay')
	methodtitle.children[0].textContent = name
	if (!method) return
	if (method.description)
		methodtitle.children[1].textContent = ' ' + method.description
	paramslist.innerHTML = ''
	for (let param of method.params) {
		const ui_def = ExecutionToolbox.get_param_uidef(param)
		ExecutionToolbox.addparam(ui_def, stringify_display(param, undefined, 2))
	}
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
	for (let param of params) {
		const checkbox = ExecutionToolbox.addparam({name: param[0], type: 'bool', label: param[1]})
		checkbox.addEventListener('change', () => {
			UI.emit('set_runningparam', {param: param[0], visible: checkbox.checked})
			if (param[0].startsWith('custom')) {
				if (param[0].endsWith('labels'))
					customlabels.parentNode.classList.toggle('nodisplay', !checkbox.checked)
				else if (param[0].endsWith('booleans'))
					custombooleans.parentNode.classList.toggle('nodisplay', !checkbox.checked)
			}
		})
		checkbox.parentNode.parentNode.dataset.forcedvisible = param[2]
		UI.add_runningsection(param[0], param[1])
	}
}
UI.set_custominfo_options = function(labels, booleans) {
	if (labels)
		customlabels.value = labels.join('\n')
	if (booleans)
		custombooleans.value = booleans.join('\n')
}

UI.get_themes = () => $ls('link.themesheet-js').map(elm => elm.title)
UI.set_theme = new_theme => {
	// Firefox doesn't like the way Vue disables stylesheets
	let theme_set = false
	for (const elem of $ls('link.themesheet-js')) {
		if (elem.title == new_theme) {
			elem.disabled = false
			theme_set = true
		} else
			elem.disabled = true
	}
	if (!theme_set)
		$ls('link.themesheet-js')[0].disabled = false
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
UI.configure_renderjson = function(fancylevel) {
	if (fancylevel === 1) {
		// syntax highlighting and shorten long strings
		renderjson.set_show_to_level(10).set_icons('', '').set_max_string_length('none')
	} else if (fancylevel === 2) {
		// collapsible
		renderjson.set_show_to_level(2).set_icons('⊕', '⊖').set_max_string_length(60)
	}
}
UI.show_log_description = function(visible) {
	$('#log-desc-js').classList.toggle('nodisplay', !visible)
}
UI.show_pdb_description = function(visible) {
	$('#webpdb-desc-js').classList.toggle('nodisplay', !visible)
}

Vue.component('icon-button', {
	template: `<button type="button" @click="click" :title="title" class="flatbutton clearbutton"
		:class="buttonClass"><i class="material-icons" :class="iconClass">{{ icon }}</i></button>`,
	props: ['title', 'icon', 'iconClass', 'buttonClass'],
	methods: {
		click() { this.$emit('click') }
	}
})
Vue.component('dialog-window', {
	template: `<div class="dialog" @click="close">
		<div class="dialog-window" @click.stop>
			<h1>{{ header }}</h1>
			<div><slot></slot></div>
			<div style="padding-top: 10px; height: 60px; display: flex;">
				<i style="flex: 1; width: 250px;">{{ description }}</i>
				<button type="button" @click="close"
					class="flatbutton action-button close-button">Close</button>
			</div>
		</div>
	</div>`,
	props: ['header', 'description'],
	methods: {
		close() { this.$emit('close') }
	}
})
