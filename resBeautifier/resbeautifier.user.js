// ==UserScript==
// @name           ResBeautifier
// @description    UserScript for Ways of History
// @include        http://w*.wofh.ru/*
// @author         Wise Hermit
// @updateURL      https://wisehermit.github.io/resBeautifier/resbeautifier.meta.js
// @downloadURL    https://wisehermit.github.io/resBeautifier/resbeautifier.user.js
// @version        1.6
// @grant          none
// ==/UserScript==

/*
 * ResBeautifier
 * https://github.com/wisehermit/resBeautifier
 */

var resBeautifierCode = function() {

function ResBeautifier() {

    this.resources = {};
    this.resources_max = 0;
    
    this.population = {};

    this.townlist = {};

    this.res_separators = [5, 11, 17, 22];
    
    this.timeoutHandler = null;
    this.offsetTime = 0;

    this.dotImg = '/p/_.gif';
    this.styles = [
        '.resBeautifier { height:20px; margin-bottom:1px; border-bottom:1px #bbb solid; }',
        '.resBeautifier  div { float:left; overflow:visible; white-space:nowrap; line-height:20px; width:50px; }',
        '.resBeautifier .progressbar { float:none; border-bottom:2px #99f solid; width:0px; height:20px; }',
        '.rbNotification { margin:10px 0px; font-size:1.1em; display:none; line-height:18px; width:225px; }',
        '.storemax { display:block; color:#000; font-weight:bold; text-align:center; padding-bottom:10px; width:100%; }'
    ];

    this.colors = {
        'r': ['da1b2a', 'e22b2d', 'df362f', 'de4b41', 'e15f52', 'e06f67', 'e3827c', 'e89295', 'e9a8ae', 'ecbdc5'],
        'g': ['c2ddd8', 'acd0c4', '92c2b2', '7fbc9b', '6eba8b', '61b67b', '5cae6c', '52a752', '50a347', '4ea242']
    };

    this.sounds = {
        'flute': '//wisehermit.github.io/resBeautifier/sounds/flute.wav',
    };


    this.initialize = function () {
        
        // Разница во времени между сервером и клиентом
        this.offsetTime = wofh.time - this.getTimestamp();

        // Проверяем наличие правой колонки на текущей странице
        if ($('.chcol1.chcol_p1').length <= 0 || typeof wofh == 'undefined') {
            return false;
        }

        // Текущая вместимость склада
        this.resources_max = wofh.town.resources.max;

        // Данные по городам
        for(var tid in wofh.account.townsArr) {
            if(typeof wofh.account.townsArr[tid].id !== 'undefined') {
                this.townlist[wofh.account.townsArr[tid].id] = wofh.account.townsArr[tid].name;
            }
        }

        // Resources
        var resId = 0;
        for(var i in lib.resource.data) {

            if(typeof lib.resource.data[i].name == 'undefined') {
                continue;
            }

            resId = parseInt(i);

            if(resId < 0 || resId != resId) { // NaN
                continue;
            }

            if(resId == 1 && !wofh.account.research.ability.money) { // no money? no problem!
                continue;
            }

            if(resId > 1 && isNaN(wofh.town.resources.current[resId])) {
                continue;
            }

            if(resId > 1 && wofh.town.resources.current[resId] < 1 && wofh.town.resources.alter[resId] <= 0) {
                continue;
            }

            this.resources[resId] = {
                name:    lib.resource.data[resId].name,
                current: parseFloat(wofh.town.resources.current[resId]),
                alter:   parseFloat(wofh.town.resources.alter[resId])
            };

            if(isNaN(this.resources[resId].current)) {
                this.resources[resId].current = 0;
            }

            this.resources[resId].initial = this.resources[resId].current;

        }

        // Population
        this.population = {
            'current':    wofh.town.pop.has,
            'culture':    wofh.town.pop.culture,
            'alteration': wofh.town.pop.incReal,
        };
        
        this.population.initial = this.population.current;

        // pop like a res
        this.resources['p'] = {
            name:    'Население',
            current: parseFloat(this.population.current),
            alter:   parseFloat(this.population.alteration)
        };
        
        this.resources['p'].initial = this.resources['p'].current;

        if(isNaN(this.population.current)) {
            this.population.current = 0;
        }

        // Создаем основной враппер и заполняем его ресурсами
        this.buildResourceBlock();
        
        // Запускаем ежесекундную обработку всех пераметров
        this.handling();


        // Вешаем дополнительное событие на слайдеры распределения наса
        $('#mt_slds').on('slidechange', function () {
            // delay for default "onchange" event
            setTimeout(function () {
                resBeautifier.resforecast();
            }, 100);
        });

    };


    this.buildResourceBlock = function () {

        // Добавляем на страницу встроенные стили
        this.createStyleSheets();

        // Для поддержки повторной инициализации
        $('#resBeautifier').remove();

        // Скрываем стандартный склад
        $('.chcol1.chcol_p1:first').hide();

        // Создаем основной враппер
        var resBeautifierWrapper = this.createElement('div', {
            'id':    'resBeautifier',
            'class': 'chcol1 chcol_p1',
            'style': 'display:block;'
        });

        // Добавляем стандартный блок с информацией о вместимости склада
        var storemaxLink = this.createElement('a', {
            'class': 'storemax'
        });
        storemaxLink.innerHTML = 'Вместимость хранилища: ';

        var storemaxSpan = this.createElement('span', {
            'id': 'storemax'
        });
        storemaxSpan.innerHTML = Math.floor(this.resources_max);

        $(storemaxLink).append(storemaxSpan);


        var notificationArea = this.createElement('div', {
            'id': 'rbNotificationArea'
        });

        $(resBeautifierWrapper).append(storemaxLink)
                               .append(notificationArea)
                               .insertAfter('.extop');

        var has_margin = false;

        // Добавляем ресурсы
        for (var resId = 0; resId <= 22; resId++) {
            if(!has_margin && (((!wofh.account.research.ability.money && resId == 1) || resId == 2) || $.inArray(resId, this.res_separators) >= 0)) {
                var separator = this.createElement('div', {
                    'style': 'margin-bottom:8px;'
                });
                $(resBeautifierWrapper).append(separator);
                has_margin = true;
            }

            if (typeof this.resources[resId] == 'undefined' || resId == 'p') {
                continue;
            }

            has_margin = false;


            // one more wrapper. this is madness.
            var wrapper = this.createElement('div', {
                'class': 'resBeautifier'
            });

            var iconImg = this.createElement('img', {
                'src':   this.dotImg,
                'class': 'res r' + resId,
                'title': this.resources[resId].name
            });

            var currentSpan = this.createElement('span', {
                'id': 'rbCurrent' + resId
            });
            currentSpan.innerHTML = this.smartRound(this.resources[resId].current, 5);

            var iconDiv = this.createElement('div', {
                'style': 'width:75px'
            });

            // Если это наука или деньги - создаем ссылку для слива
            if (resId <= 1) {
                var upLink = this.createElement('a', {
                    'onclick': resId == 0 ? '$("#scienceup").click();' : '$("#moneyup").click();'
                });
                $(upLink).append(iconImg);

                iconImg = upLink; // lousy..
            }

            $(iconDiv).append(iconImg)
                      .append(currentSpan);

            $(wrapper).append(iconDiv);


            var alterDiv = this.createElement('div', {
                'id': 'rbAlter' + resId
            });
            var alter = this.resources[resId].alter;
            alterDiv.innerHTML = alter != 0 ? ((alter > 0 ? '+' : '') + this.smartRound(alter, 4)) : '&nbsp;';

            $(wrapper).append(alterDiv);


            var percentDiv = this.createElement('div', {
                'id': 'rbPercent' + resId
            });
            percentDiv.innerHTML = '&nbsp;';

            $(wrapper).append(percentDiv);


            var timeleftDiv = this.createElement('div', {
                'id':    'rbTimeleft' + resId,
                'style': 'width:65px'
            });
            timeleftDiv.innerHTML = '&nbsp;';

            $(wrapper).append(timeleftDiv);


            var dropdownDiv = this.createElement('div', {
                'style': 'width:10px;position:relative'
            });

            var dropdownImg = this.createElement('img', {
                'src':      this.dotImg,
                'class':   'icsort2',
                'style':   'cursor:pointer',
            });

            dropdownImg.onclick = function(x) {
                return function() {
                    resBeautifier.showNotificationForm(x);
                };
            }(resId);

            $(dropdownDiv).append(dropdownImg);

            $(wrapper).append(dropdownDiv);


            var progressBarDiv = this.createElement('div', {
                'id':    'rbProgressBar' + resId,
                'class': 'progressbar'
            });

            $(wrapper).append(progressBarDiv);


            var notificationDiv = this.createElement('div', {
                'id':    'rbNotification' + resId,
                'class': 'acont rbNotification',
            });


            // wrapper into wrapper with wrappers...
            $(resBeautifierWrapper).append(wrapper)
                                   .append(notificationDiv);

        }

        // Population
        $('.chcol2.chcol_p1 .aC').remove();

        var wrapper = this.createElement('div', {
            'class': 'resBeautifier',
            'style': 'margin-bottom: 8px'
        });

        var iconImg = this.createElement('img', {
            'src':   this.dotImg,
            'class': 'res rp',
        });

        var iconDiv = this.createElement('div', {
            'style': 'width:140px'
        });

        var popDataSpan = this.createElement('span', {
            'id': 'rbCurrentp'
        });
        popDataSpan.innerHTML = '0/0 (+0.0)';

        $(iconDiv).append(iconImg)
                  .append(popDataSpan);

        $(wrapper).append(iconDiv);

        var percentDiv = this.createElement('div', {
            'id': 'rbPercentp',
            'style': 'width:40px',
        });
        percentDiv.innerHTML = '&nbsp;';

        var timeleftDiv = this.createElement('div', {
            'id':    'rbTimeleftp',
            'style': 'width:60px'
        });
        timeleftDiv.innerHTML = '&nbsp;';

        $(wrapper).append(percentDiv)
                  .append(timeleftDiv);

        var dropdownDiv = this.createElement('div', {
            'style': 'width:2px;position:relative'
        });

        var dropdownImg = this.createElement('img', {
            'src':      this.dotImg,
            'class':   'icsort2',
            'style':   'cursor:pointer',
        });

        dropdownImg.onclick = function(x) {
            return function() {
                resBeautifier.showNotificationForm(x);
            };
        }('p');

        $(dropdownDiv).append(dropdownImg);

        $(wrapper).append(dropdownDiv);

        var notificationDiv = this.createElement('div', {
            'id':    'rbNotificationp',
            'class': 'acont rbNotification',
        });

        $('.chcol2.chcol_p1').prepend(notificationDiv)
                             .prepend(wrapper);

    };
    

    this.showNotificationForm = function (resId) {

        $('#rbNotification' + resId).html('<a>Напоминание о достижении лимита</a>');


        var notificationSpan = this.createElement('span', {
            'style': 'float:left;width:90px'
        });
        notificationSpan.innerHTML = 'Ресурс:';

        $('#rbNotification' + resId).append(notificationSpan);


        var iconImg = this.createElement('img', {
            'src':   this.dotImg,
            'class': 'res r' + resId,
            'title': this.resources[resId].name
        });

        $('#rbNotification' + resId).append(iconImg);

        // current value
        $('#rbNotification' + resId + ' img').after(this.smartRound(this.resources[resId].current, 5));

        var rbn = JSON.parse(this.getCookie('rbNotifications') || '{}');
        if (typeof rbn[wofh.town.id + resId] != 'undefined') {
        
            $('#rbNotification' + resId).append(this.createElement('div'));

            var notificationSpan = this.createElement('span', {
                'style': 'float:left;width:90px;clear:both'
            });
            notificationSpan.innerHTML = 'Установлено:';

            $('#rbNotification' + resId).append(notificationSpan);


            var iconImg = this.createElement('img', {
                'src':   this.dotImg,
                'class': 'res r' + resId,
                'title': this.resources[resId].name
            });

            $('#rbNotification' + resId).append(iconImg);

            $('#rbNotification' + resId + ' img:last').after(this.smartRound(rbn[wofh.town.id + resId][4], 5));

            var delLink = this.createElement('a', {
                'href': '#'
            });

            $(delLink).click(function(x) {
                return function() {
                    resBeautifier.delNotification(x);
                    return false;
                };
            }(resId)).append('удалить');

            $('#rbNotification' + resId).append(' (').append(delLink).append(')');

        }

        notificationSpan = this.createElement('span', {
            'style': 'float:left;width:90px;clear:both'
        });
        notificationSpan.innerHTML = 'Количество:';

        $('#rbNotification' + resId).append(notificationSpan);


        var fraction = this.resources[resId].current / 250;

        var notificationInput = this.createElement('input', {
            'id':    'rbNoticeValue' + resId,
            'value': (this.resources[resId].alter >= 0 ? Math.ceil(fraction) : Math.floor(fraction)) * 250
        });

        $('#rbNotification' + resId).append(notificationInput);


        var notificationSubmit = this.createElement('input', {
            'type':    'submit',
            'value':   'Установить напоминание',
            'style':   'margin:5px 0 0 45px',
        });

        notificationSubmit.onclick = function(x) {
            return function() {
                resBeautifier.setNotification(x);
                return false;
            };
        }(resId);

        $('#rbNotification' + resId).append(notificationSubmit);

        // toggle form on click
        $('#rbNotification' + resId).toggle();

    };


    this.handling = function () {

        // just in case
        clearTimeout(this.timeoutHandler);

        for (var resId in this.resources) {

            var elapsed = this.getTimestamp() + this.offsetTime - wofh.time;
            this.resources[resId].current = this.resources[resId].initial + this.resources[resId].alter / (resId == 'p' ? 86400 : 3600) * elapsed;

            if (this.resources[resId].current < 0) {
                this.resources[resId].current = 0;
            }

            if (resId != 'p' && resId > 1 && this.resources[resId].current > this.resources_max) {
                this.resources[resId].current = this.resources_max;
            }

            if (resId == 'p') {

                var curPop = Math.floor(this.resources[resId].current) + '/' + Math.floor(this.population.culture)
                           + ' (' + (this.population.alteration >= 0 ? '+' : '') + this.smartRound(this.population.alteration, 4) + ')';

                $('#rbCurrent' + resId).html(curPop);

            } else {

                $('#rbCurrent' + resId).html(this.smartRound(this.resources[resId].current, 5));

            }

            var percent = this.getPercent(resId);
            $('#rbPercent' + resId).html(percent + '%');


            var timeleft = this.getTimeLeft(resId);

            $('#rbTimeleft' + resId).html(timeleft)
                                    .css('color', timeleft == '00:00:00' ? '#d33' : '#000');


            var pop_limit_left = (this.population.culture - this.resources['p'].current) / (this.resources['p'].alter / 24) * 3600;
            if (resId == 'p' && (pop_limit_left < 86400 || this.resources['p'].current > this.population.culture)) {
                $('#rbCurrent' + resId).css('color', '#d33')
                                       .css('font-weight', 'bold');
            }

            if (resId != 'p') {
                this.setProgressBar(resId, percent);
            }

        }

        // notifications
        var rbn = JSON.parse(this.getCookie('rbNotifications') || '{}');

        for (var i in rbn) {
            
            if (rbn[i][0] == wofh.town.id) {
                rbn[i][2] = this.resources[rbn[i][1]].initial;
                rbn[i][3] = this.resources[rbn[i][1]].alter;
                rbn[i][5] = wofh.time;
            }

            var current = Math.floor(rbn[i][2] + rbn[i][3] / (rbn[i][1] == 'p' ? 86400 : 3600) * (this.getTimestamp() + this.offsetTime - rbn[i][5]));
            if ((rbn[i][2] < rbn[i][4] && current >= rbn[i][4]) || (rbn[i][2] > rbn[i][4] && current <= rbn[i][4])) {
                
                this.showNotification(rbn[i][0], rbn[i][1], rbn[i][4]);

                var audio = this.createElement('audio', {
                    'src':      this.sounds.flute,
                    'preload': 'auto',
                });

                audio.play();
                
                delete rbn[i];
                
            }

        }

        this.setCookie('rbNotifications', JSON.stringify(rbn), {
            domain: '.wofh.ru'
        });


        this.timeoutHandler = setTimeout(function () {
            resBeautifier.handling();
        }, 1000);

    };


    this.getPercent = function (resId) {

        var max = this.resources_max;

        if (resId == 0) {
            max = this.resources[resId].alter / Math.round(wofh.town.budget.bars[0] * 100) * 60 * 6.6667;
        }

        if (resId == 1) {
            max = Math.abs(this.resources[resId].alter) * 8.0000;
        }

        if (resId == 'p') {
            max = this.population.culture;
        }

        if(resId != 0 && resId != 'p' && this.resources[resId].current >= max) {
            this.resources[resId].percent = 100;
        } else {
            this.resources[resId].percent = Math.floor(this.resources[resId].current / (Math.round(max) / 100)); // r>f
        }

        return this.resources[resId].percent;

    };


    this.getTimeLeft = function (resId, endtime) {

        endtime = endtime || false;

        if (resId != 'p' && this.resources[resId].alter == 0) {
            return;
        }


        var boundary = this.resources[resId].alter > 0 ? this.resources_max : 0;

        if (resId == 0) {
            var limit = this.resources[resId].percent < 100 ? 6.6667 : 12;
            boundary = this.resources[resId].alter / Math.round(wofh.town.budget.bars[0] * 100) * 60 * limit;
        }

        if (resId == 1 && this.resources[resId].alter > 0) {
            boundary = this.resources[resId].alter * 8.0000;
        }

        if (resId == 'p') {
            boundary = this.resources[resId].alter > 0 ? this.population.culture : 0;
        }

        var seconds = (boundary - this.resources[resId].current) / (this.resources[resId].alter / (resId != 'p' ? 1 : 24)) * 3600;

        if (endtime) {

            if(seconds <= 0) {
                return 'already';
            }

            var timezoneOffset = (new Date).getTimezoneOffset() * 60 + servodata.account.timezone * 3600;
            var date = new Date((this.getTimestamp() + this.offsetTime + seconds + timezoneOffset) * 1000);

            return value = ('0' + date.getHours()).slice(-2) + ':'
                         + ('0' + date.getMinutes()).slice(-2) + ':'
                         + ('0' + date.getSeconds()).slice(-2) + ' '
                         + ('0' + date.getDate()).slice(-2) + '.'
                         + ('0' + (date.getMonth() + 1)).slice(-2) + '.'
                         + date.getFullYear();

        }

        if (seconds < 0) {
            return '00:00:00';
        }
        
        if (seconds > 86400 * 1000) {
            return '&infin;';
        }

        if (seconds > 86400 * 3) {
            return (seconds / 86400).toFixed(1) + ' дн.';
        }

        seconds = parseInt(seconds, 10);

        var h = ('0' + Math.floor(seconds / 3600)).slice(-2);
        var m = ('0' + Math.floor((seconds - (h * 3600)) / 60)).slice(-2);
        var s = ('0' + (seconds - (h * 3600) - (m * 60))).slice(-2);

        return h + ':' + m + ':' + s;

    };

    
    this.setProgressBar = function (resId, percent) {

        percent = percent || this.getPercent(resId);

        var color = '9999ff'; // alter = 0

        if (percent >= 100) {
            color = 'b681b4';
            percent = 100;
        }

        if (this.resources[resId].alter != 0 && percent != 100) {
            var colKey = Math.floor(percent / 10);
            color = this.colors[this.resources[resId].alter > 0 && resId != 'p' ? 'g' : 'r'][resId == 'p' ? 10 - colKey : colKey];
        }

        $('#rbProgressBar' + resId).css('width', percent + '%')
                                   .css('border-color', '#' + color);

    };


    this.setNotification = function (resId) {

        var alter   = this.resources[resId].alter,
            current = this.resources[resId].current,
            value   = parseInt($('#rbNoticeValue' + resId).val());


        if (alter == 0 || value < 0 || value > this.resources_max || (alter > 0 && value < current) || (alter < 0 && value > current)) {
            alert('Невозможно установить указанный лимит. Проверьте введенное значение и попробуйте снова.');
            return false;
        }


        var notifications = JSON.parse(this.getCookie('rbNotifications') || '{}');

        notifications[wofh.town.id + resId] = [
            wofh.town.id, resId, current, alter, value, wofh.time
        ];

        this.setCookie('rbNotifications', JSON.stringify(notifications), {
            domain: '.wofh.ru'
        });
        
        $('#rbNotification' + resId).html('Установлено')
                                    .delay(1000).fadeOut(500);

    };


    this.delNotification = function (resId) {

        var notifications = JSON.parse(this.getCookie('rbNotifications') || '{}');

        delete notifications[wofh.town.id + resId];

        this.setCookie('rbNotifications', JSON.stringify(notifications), {
            domain: '.wofh.ru'
        });
        
        $('#rbNotification' + resId).html('Удалено')
                                    .delay(1000).fadeOut(500);

    };


    this.showNotification = function (townId, resId, value) {

        var notificationDiv = this.createElement('div', {
            'class': 'acont',
            'style': 'margin-bottom:10px'
        });

        var resIconImg = this.createElement('img', {
            'src':   this.dotImg,
            'class': 'res r' + resId,
            'title': this.resources[resId].name
        });

        $(notificationDiv).append(resIconImg)
                          .find('img')
                          .after(value + ' доступно в ');


        var townIconImg = this.createElement('img', {
            'src':   this.dotImg,
            'class': 'icon_town',
            'style': 'vertical-align:top'
        });

        var chtownLink = this.createElement('a', {
            'href': '#'
        });

        $(chtownLink).click(function () {

            $('#hide_inpt').val(townId);
            $('#ch_townf').submit();

        }).append(this.townlist[townId]);

        $(notificationDiv).append(townIconImg)
                          .append(chtownLink);


        $('#rbNotificationArea').append(notificationDiv);

    };


    this.resforecast = function () {

        for (var resId in this.resources) {

            var type = 2;

            if (resId < 2) {
                type = resId;
            }

            if (resId > 1 && !wofh.account.research.ability.money) {
                type = lib.resource.data[resId].prodtype - 1;
            }

            var alteration  = 0,
                stream      = wofh.town.resources.stream[resId],
                cons        = wofh.town.resources.cons[resId],
                consumption = core.calcResourceConsumption(wofh.town, resId),
                buildStatic = wofh.town.resources.buildStatic[resId];


            if(resId == 0) {
                alteration = wofh.core.calcResourceAlteration(wofh.town, {'budget': 1}, 0);
            } else {
                alteration = wofh.core.calcResourceAlteration(wofh.town, {'budget': 1, stream: 0, cons: 0, consumption: 0, buildStatic: 0}, resId);
            }

            
            var value = (alteration / 100 * $('#sp' + type).val())
                      + (typeof stream      !== 'undefined' ? stream      : 0)
                      - (typeof cons        !== 'undefined' ? cons        : 0)
                      - (typeof consumption !== 'undefined' ? consumption : 0)
                      + (typeof buildStatic !== 'undefined' ? buildStatic : 0);


            if (alteration > 0) {
                $('#rbAlter' + resId).html(value != 0 ? ((value > 0 ? '+' : '') + this.smartRound(value, 4)) : '&nbsp;');
            }

        }

    };


    this.smartRound = function (value, maxlen) {

        return (Math.floor(value * 1000) / 1000).toFixed(Math.abs(value).toFixed(1).length <= maxlen ? 1 : 0);

    };


    this.createElement = function (type, attributes) {

        var element = document.createElement(type);

        for (var attrName in attributes) {
            element.setAttribute(attrName, attributes[attrName]);
        }

        return element;

    };


    this.createStyleSheets = function () {

        var head = document.head || document.getElementsByTagName('head')[0],
            style = document.createElement('style');

        style.type = 'text/css';
        if (style.styleSheet) {
            style.styleSheet.cssText = this.styles.join('');
        } else {
            style.appendChild(document.createTextNode(this.styles.join('')));
        }

        head.appendChild(style);

    };


    this.getCookie = function (name) {

        var matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
        return matches ? decodeURIComponent(matches[1]) : undefined;

    };


    this.setCookie = function (name, value, options) {

        options = options || {};

        var expires = options.expires;

        if (typeof expires == 'number' && expires) {
            var d = new Date();
            d.setTime(d.getTime() + expires * 1000);
            expires = options.expires = d;
        }

        if (expires && expires.toUTCString) {
            options.expires = expires.toUTCString();
        }

        value = encodeURIComponent(value);

        var updatedCookie = name + '=' + value;

        for (var propName in options) {
            updatedCookie += '; ' + propName;
            var propValue = options[propName];
            if (propValue !== true) {
                updatedCookie += '=' + propValue;
            }
        }

        document.cookie = updatedCookie;

    };

    
    this.getTimestamp = function () {

        return Math.floor(new Date().getTime() / 1000);

    };
    
}

var resBeautifier = new ResBeautifier();
resBeautifier.initialize();

}; // end of resBeautifierCode


// injecting code in the page (for google chrome)
setTimeout(function () {
    var rbScript = document.createElement('script');
    rbScript.textContent = '(' + resBeautifierCode + ')()';
    (document.body || document.getElementsByTagName('body')[0]).appendChild(rbScript);
}, 100);
