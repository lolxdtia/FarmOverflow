define('TWOverflow/Farm/interface', [
    'TWOverflow/Farm',
    'TWOverflow/locale',
    'TWOverflow/Interface',
    'TWOverflow/Interface/buttonLink',
    'TWOverflow/FrontButton',
    'TWOverflow/utils',
    'TWOverflow/eventQueue',
    'helper/time',
    'Lockr',
    'ejs'
], function (
    Farm,
    Locale,
    Interface,
    buttonLink,
    FrontButton,
    utils,
    eventQueue,
    $timeHelper,
    Lockr,
    ejs
) {
    // Controlador de interface
    var ui
    // Controlador do botão para abrir a janela da interface
    var opener
    // Atalhos rapidos para os elementos da janela.
    var $window
    var $events
    var $last
    var $status
    var $start
    var $settings
    var $preset

    /**
     * Contagem de eventos inseridos na visualização.
     *
     * @type {Number}
     */
    var eventsCount = 1

    /**
     * Usado para obter a identificação dos presets e a descrição.
     *
     * @type {RegExp}
     */
    var rpreset = /(\(|\{|\[|\"|\')[^\)\}\]\"\']+(\)|\}|\]|\"|\')/

    /**
     * Tradução de "desativado" para a linguagem selecionada.
     *
     * @type {String}
     */
    var disabled

    /**
     * Lista de grupos disponíveis na conta do jogador
     *
     * @type {Object}
     */
    var groups

    /**
     * Elementos dos grupos usados pelo FarmOverflow.
     *
     * @type {Object}
     */
    var $groups

    /**
     * Loop em todas configurações do FarmOverflow
     *
     * @param {Function} callback
     */
    var eachSetting = function (callback) {
        $window.find('[data-setting]').forEach(function ($input) {
            var settingId = $input.dataset.setting

            callback($input, settingId)
        })
    }

    var saveSettings = function () {
        var newSettings = {}

        eachSetting(function ($input, settingId) {
            var inputType = Farm.settingsMap[settingId].inputType

            switch (inputType) {
            case 'text':
                newSettings[settingId] = $input.type === 'number'
                    ? parseInt($input.value, 10)
                    : $input.value

                break
            case 'select':
                newSettings[settingId] = $input.dataset.value

                break
            case 'checkbox':
                newSettings[settingId] = $input.checked

                break
            }
        })

        if (Farm.updateSettings(newSettings)) {
            utils.emitNotif('success', Locale('farm', 'settings.saved'))

            return true
        }

        return false
    }

    /**
     * Insere as configurações na interface.
     */
    var populateSettings = function () {
        eachSetting(function ($input, settingId) {
            var inputType = Farm.settingsMap[settingId].inputType

            switch (inputType) {
            case 'text':
                $input.value = Farm.settings[settingId]

                break
            case 'select':
                $input.dataset.value = Farm.settings[settingId]

                break
            case 'checkbox':
                if (Farm.settings[settingId]) {
                    $input.checked = true
                    $input.parentElement.classList.add('icon-26x26-checkbox-checked')
                }

                break
            }
        })
    }

    /**
     * Popula a lista de eventos que foram gerados em outras execuções
     * do FarmOverflow.
     */
    var populateEvents = function () {
        var lastEvents = Farm.getLastEvents()

        // Caso tenha algum evento, remove a linha inicial "Nada aqui ainda"
        if (lastEvents.length > 0) {
            $events.find('.nothing').remove()
        }

        lastEvents.some(function (event) {
            if (eventsCount >= Farm.settings.eventsLimit) {
                return true
            }

            if (!Farm.settings.eventAttack && event.type === 'sendCommand') {
                return false
            }

            if (!Farm.settings.eventVillageChange && event.type === 'nextVillage') {
                return false
            }

            if (!Farm.settings.eventPriorityAdd && event.type === 'priorityTargetAdded') {
                return false
            }

            if (!Farm.settings.eventIgnoredVillage && event.type === 'ignoredVillage') {
                return false
            }

            addEvent(event, true)
        })
    }

    /**
     * Configura todos eventos dos elementos da interface.
     */
    var bindEvents = function () {
        angularHotkeys.add(Farm.settings.hotkeySwitch, function () {
            Farm.switch()
        })

        angularHotkeys.add(Farm.settings.hotkeyWindow, function () {
            ui.openWindow()
        })

        $start.on('click', function () {
            Farm.switch()
        })

        $window.find('.save').on('click', function (event) {
            saveSettings()
        })
    }

    /**
     * Adiciona um evento na aba "Eventos".
     *
     * @param {Object} options - Opções do evento.
     * @param {Boolean=} _populate - Indica quando o script está apenas populando
     *      a lista de eventos, então não é alterado o "banco de dados".
     */
    var addEvent = function (options, _populate) {
        $events.find('.nothing').remove()

        if (eventsCount >= Farm.settings.eventsLimit) {
            $events.find('tr:last-child').remove()
        }

        var lastEvents = Farm.getLastEvents()

        if (lastEvents.length >= Farm.settings.eventsLimit) {
            lastEvents.pop()
        }

        addRow($events, options, _populate)
        eventsCount++

        if (!_populate) {
            options.timestamp = $timeHelper.gameTime()

            lastEvents.unshift(options)
            Farm.setLastEvents(lastEvents)
        }
    }

    /**
     * Adiciona uma linha (tr) com links internos do jogo.
     *
     * @param {Object} options
     * @param {Boolean} [_populate] - Indica quando o script está apenas populando
     *      a lista de eventos, então os elementos são adicionados no final da lista.
     */
    var addRow = function ($where, options, _populate) {
        var linkButton = {}
        var linkTemplate = {}
        var links = options.links
        var timestamp = options.timestamp || $timeHelper.gameTime()
        var eventElement = document.createElement('tr')

        if (links) {
            for (var key in links) {
                linkButton[key] = buttonLink(links[key].type, links[key].name, links[key].id)
                linkTemplate[key] = '<a id="' + linkButton[key].id + '"></a>'
            }

            options.content = Locale('farm', 'events.' + options.type, linkTemplate)
        }

        var longDate = utils.formatDate(timestamp)
        var shortDate = utils.formatDate(timestamp, 'HH:mm:ss')

        eventElement.innerHTML = ejs.render('__farm_html_event', {
            longDate: longDate,
            shortDate: shortDate,
            icon: options.icon,
            content: options.content
        })

        if (links) {
            for (var key in linkButton) {
                eventElement.querySelector('#' + linkButton[key].id).replaceWith(linkButton[key].elem)
            }
        }

        $where[_populate ? 'append' : 'prepend'](eventElement)

        // Recalcula o scrollbar apenas se a janela e
        // aba correta estiverem abertas.
        if (ui.isVisible('log')) {
            ui.recalcScrollbar()
        }

        ui.setTooltips()
    }

    /**
     * Atualiza o elemento com a aldeias atualmente selecionada
     */
    var updateSelectedVillage = function () {
        var $selected = $window.find('.selected')
        var selectedVillage = Farm.getSelectedVillage()

        if (!selectedVillage) {
            return $selected.html(Locale('common', 'none'))
        }

        var village = buttonLink('village', utils.genVillageLabel(selectedVillage), selectedVillage.id)

        $selected.html('')
        $selected.append(village.elem)
    }

    /**
     * Atualiza o elemento com a data do último ataque enviado
     * Tambem armazena para ser utilizado nas proximas execuções.
     *
     * @param {[type]} [varname] [description]
     */
    var updateLastAttack = function (lastAttack) {
        if (!lastAttack) {
            lastAttack = Farm.getLastAttack()

            if (lastAttack === -1) {
                return false
            }
        }

        $last.html(utils.formatDate(lastAttack))

        updateQuickview()
    }

    /**
     * Atualiza a lista de grupos na aba de configurações.
     */
    var updateGroupList = function () {
        for (var type in $groups) {
            var $selectedOption = $groups[type].find('.custom-select-handler').html('')
            var $data = $groups[type].find('.custom-select-data').html('')

            appendDisabledOption($data, '0')

            for (var id in groups) {
                var name = groups[id].name
                var selected = Farm.settings[type] == id

                if (Farm.settings[type] === '') {
                    $selectedOption.html(disabled)
                    $groups[type][0].dataset.name = disabled
                    $groups[type][0].dataset.value = ''
                } else if (Farm.settings[type] == id) {
                    $selectedOption.html(name)
                    $groups[type][0].dataset.name = name
                    $groups[type][0].dataset.value = id
                }

                appendSelectData($data, {
                    name: name,
                    value: id,
                    icon: groups[id].icon
                })

                $groups[type].append($data)
            }

            if (!Farm.settings[type]) {
                $selectedOption.html(disabled)
            }
        }
    }

    /**
     * Atualiza a lista de presets na aba de configurações.
     */
    var updatePresetList = function () {
        var loaded = {}
        var presets = modelDataService.getPresetList().presets

        var selectedPresetExists = false
        var selectedPreset = Farm.settings.presetName
        var $selectedOption = $preset.find('.custom-select-handler').html('')
        var $data = $preset.find('.custom-select-data').html('')

        appendDisabledOption($data)

        for (var id in presets) {
            var presetName = presets[id].name.replace(rpreset, '').trim()

            if (presetName in loaded) {
                continue
            }

            // presets apenas com descrição sem identificação são ignorados
            if (!presetName) {
                continue
            }

            if (selectedPreset === '') {
                $selectedOption.html(disabled)
                $preset[0].dataset.name = disabled
                $preset[0].dataset.value = ''
            } else if (selectedPreset === presetName) {
                $selectedOption.html(presetName)
                $preset[0].dataset.name = presetName
                $preset[0].dataset.value = presetName

                selectedPresetExists = true
            }

            appendSelectData($data, {
                name: presetName,
                value: presetName,
                icon: 'size-26x26 icon-26x26-preset'
            })

            loaded[presetName] = true
        }

        if (!selectedPresetExists) {
            $selectedOption.html(disabled)
            $preset[0].dataset.name = disabled
            $preset[0].dataset.value = ''
        }
    }

    /**
     * Atualiza as informações rápidas do botão inicial do FarmOverflow
     * @return {[type]} [description]
     */
    var updateQuickview = function () {
        var last = Locale('farm', 'events.lastAttack')
        var text = last + ': ' + $last.html()

        opener.updateQuickview(text)
    }

    /**
     * Gera uma opção "desativada" padrão em um custom-select
     *
     * @param  {jqLite} $data - Elemento que armazenada o <span> com dataset.
     * @param {String=} _disabledValue - Valor da opção "desativada".
     */
    var appendDisabledOption = function ($data, _disabledValue) {
        var dataElem = document.createElement('span')
        dataElem.dataset.name = disabled
        dataElem.dataset.value = _disabledValue || ''

        $data.append(dataElem)
    }

    /**
     * Popula o dataset um elemento <span>
     *
     * @param  {jqLite} $data - Elemento que armazenada o <span> com dataset.
     * @param  {[type]} data - Dados a serem adicionados no dataset.
     */
    var appendSelectData = function ($data, data) {
        var dataElem = document.createElement('span')

        for (var key in data) {
            dataElem.dataset[key] = data[key]
        }

        $data.append(dataElem)
    }

    function FarmInterface () {
        groups = modelDataService.getGroupList().getGroups()

        disabled = Locale('farm', 'general.disabled')

        // Valores a serem substituidos no template da janela
        var replaces = {
            version: Farm.version,
            author: __overflow_author,
            locale: Locale
        }

        ui = new Interface('FarmOverflow', {
            activeTab: 'info',
            template: '__farm_html_window',
            replaces: replaces,
            css: '__farm_css_style'
        })

        opener = new FrontButton('Farm')
        opener.hover(updateQuickview)
        opener.click(function () {
            ui.openWindow()
        })

        $window = $(ui.$window)
        $events = $window.find('.events')
        $last = $window.find('.last')
        $status = $window.find('.status')
        $start = $window.find('.start')
        $settings = $window.find('.settings')
        $preset = $window.find('.preset')
        $groups = {
            groupIgnore: $window.find('.ignore'),
            groupInclude: $window.find('.include'),
            groupOnly: $window.find('.only')
        }

        eventQueue.bind('Farm/sendCommand', function (from, to) {
            $status.html(Locale('farm', 'events.attacking'))
            updateLastAttack($timeHelper.gameTime())

            if (!Farm.settings.eventAttack) {
                return false
            }

            addEvent({
                links: {
                    origin: { type: 'village', name: utils.genVillageLabel(from), id: from.id },
                    target: { type: 'village', name: utils.genVillageLabel(to), id: to.id }
                },
                icon: 'attack-small',
                type: 'sendCommand'
            })
        })

        eventQueue.bind('Farm/nextVillage', function (next) {
            updateSelectedVillage()

            if (!Farm.settings.eventVillageChange) {
                return false
            }

            addEvent({
                links: {
                    village: { type: 'village', name: utils.genVillageLabel(next), id: next.id }
                },
                icon: 'village',
                type: 'nextVillage'
            })
        })

        eventQueue.bind('Farm/ignoredVillage', function (target) {
            if (!Farm.settings.eventIgnoredVillage) {
                return false
            }

            addEvent({
                links: {
                    target: { type: 'village', name: utils.genVillageLabel(target), id: target.id }
                },
                icon: 'check-negative',
                type: 'ignoredVillage'
            })
        })

        eventQueue.bind('Farm/priorityTargetAdded', function (target) {
            if (!Farm.settings.eventPriorityAdd) {
                return false
            }

            addEvent({
                links: {
                    target: { type: 'village', name: utils.genVillageLabel(target), id: target.id }
                },
                icon: 'parallel-recruiting',
                type: 'priorityTargetAdded'
            })
        })

        eventQueue.bind('Farm/noPreset', function () {
            addEvent({
                icon: 'info',
                type: 'noPreset'
            })

            $status.html(Locale('common', 'paused'))
        })

        eventQueue.bind('Farm/noUnits', function () {
            if (Farm.isSingleVillage()) {
                $status.html(Locale('farm', 'events.noUnits'))
            }
        })

        eventQueue.bind('Farm/noUnitsNoCommands', function () {
            $status.html(Locale('farm', 'events.noUnitsNoCommands'))
        })

        eventQueue.bind('Farm/start', function () {
            $status.html(Locale('farm', 'events.attacking'))
        })

        eventQueue.bind('Farm/pause', function () {
            $status.html(Locale('common', 'paused'))
        })

        eventQueue.bind('Farm/noVillages', function () {
            $status.html(Locale('farm', 'events.noVillages'))
        })

        eventQueue.bind('Farm/singleCycleEnd', function () {
            $status.html(Locale('farm', 'events.singleCycleEnd'))
        })

        eventQueue.bind('Farm/singleCycleNext', function () {
            var next = $timeHelper.gameTime() + Farm.cycle.getInterval()

            $status.html(Locale('farm', 'events.singleCycleNext', {
                time: utils.formatDate(next)
            }))
        })

        eventQueue.bind('Farm/singleCycleNextNoVillages', function () {
            var next = $timeHelper.gameTime() + Farm.cycle.getInterval()

            $status.html(Locale('farm', 'events.singleCycleNextNoVillages', {
                time: utils.formatDate(next)
            }))
        })

        eventQueue.bind('Farm/villagesUpdate', function () {
            updateSelectedVillage()
        })

        eventQueue.bind('Farm/startLoadingTargers', function () {
            $status.html(Locale('farm', 'events.loadingTargets'))
        })

        eventQueue.bind('Farm/endLoadingTargers', function () {
            $status.html(Locale('farm', 'events.analyseTargets'))
        })

        eventQueue.bind('Farm/attacking', function () {
            $status.html(Locale('farm', 'events.attacking'))
        })

        eventQueue.bind('Farm/commandLimitSingle', function () {
            $status.html(Locale('farm', 'events.commandLimit'))
        })

        eventQueue.bind('Farm/commandLimitMulti', function () {
            $status.html(Locale('farm', 'events.noVillages'))
        })

        eventQueue.bind('Farm/resetEvents', function () {
            eventsCount = 0
            populateEvents()
        })

        eventQueue.bind('Farm/groupsChanged', function () {
            updateGroupList()
        })

        eventQueue.bind('Farm/presetsLoaded', function () {
            updatePresetList()
        })

        eventQueue.bind('Farm/presetsChange', function () {
            updatePresetList()
        })

        eventQueue.bind('Farm/start', function () {
            $start.html(Locale('common', 'pause'))
            $start.removeClass('btn-green').addClass('btn-red')
            opener.$elem.removeClass('btn-green').addClass('btn-red')
        })

        eventQueue.bind('Farm/pause', function () {
            $start.html(Locale('common', 'start'))
            $start.removeClass('btn-red').addClass('btn-green')
            opener.$elem.removeClass('btn-red').addClass('btn-green')
        })

        eventQueue.bind('Farm/settingError', function (key, replaces) {
            var localeKey = 'settingError.' + key

            utils.emitNotif('error', Locale('farm', localeKey, replaces))
        })

        if (modelDataService.getPresetList().isLoaded()) {
            updatePresetList()
        }

        populateSettings()
        bindEvents()
        updateGroupList()
        updateSelectedVillage()
        updateLastAttack()
        populateEvents()

        return ui
    }

    Farm.interface = function () {
        Farm.interface = FarmInterface()
    }
})
