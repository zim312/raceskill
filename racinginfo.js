// ==UserScript==
// @name         Torn: Racing enhancements modz by zim312
// @namespace    lugburz.racing_enhancements
// @version      0.0.1
// @description  Show car's current speed, precise skill, official race penalty.
// @author       Lugburz
// @match        https://www.torn.com/*
// @require      https://github.com/f2404/torn-userscripts/raw/31f4faa6da771b7a16cf732c1a78970506effeeb/lib/lugburz_lib.js
// @updateURL    https://github.com/f2404/torn-userscripts/raw/master/racing_show_speed.user2.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @run-at       document-body
// ==/UserScript==

// Whether to show notifications.
const NOTIFICATIONS = GM_getValue('showNotifChk') != 0;

// Whether to show race result as soon as a race starts.
const SHOW_RESULTS = GM_getValue('showResultsChk') != 0;

// Whether to show current speed.
const SHOW_SPEED = GM_getValue('showSpeedChk') != 0;

// Whether to share racing skill
const SHARE_RS = GM_getValue('shareSkill') != 0;

const arsonBaseApiUrl = 'https://cs.etmc.org/torn/api/v1';
const racingSkillCacheByDriverId = new Map();


var period = 1000;
var last_compl = -1.0;
var x = 0;
var penaltyNotif = 0;

function maybeClear() {
    if (x != 0 ) {
        clearInterval(x);
        last_compl = -1.0;
        x = 0;
    }
}
async function insertRacingSkillsIntoCurrentDriversList() {
    const driversList = document.getElementById('leaderBoard');
    if (driversList === null) {
        return;
    }

    watchForDriversListContentChanges(driversList);

    const racingSkills = await getRacingSkillForDrivers(getDriverIds(driversList));
    for (let driver of driversList.querySelectorAll('.driver-item')) {
        const driverId = getDriverId(driver);
        if (! racingSkills[driverId]) {
            continue;
        }
        const nameDiv = driver.querySelector('.name');
        nameDiv.style.position = 'relative';
        nameDiv.insertAdjacentHTML('beforeend', `<span style="position:absolute;right:5px">${racingSkills[driverId]}</span>`);
    }
}

function watchForDriversListContentChanges(driversList) {
    if (driversList.dataset.hasWatcher !== undefined) {
        return;
    }

    // The content of #leaderBoard is rebuilt periodically so watch for changes:
    new MutationObserver(insertRacingSkillsIntoCurrentDriversList).observe(driversList, {childList: true});
    driversList.dataset.hasWatcher = 'true';
}

function fetchRacingSkillForDrivers(driverIds) {
    return new Promise(resolve => {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${arsonBaseApiUrl}/racing-skills?expect_strings&drivers=${driverIds.join(',')}`,
            onload: ({responseText}) => resolve(JSON.parse(responseText)),
        });
    });
}

function saveRacingSkill(userId, racingSkillString) {
	if (SHARE_RS){
		return new Promise(resolve => {
			GM_xmlhttpRequest({
				method: 'POST',
				url: `${arsonBaseApiUrl}/players/${userId}/racing-skill`,
				data: JSON.stringify({racing_skill: racingSkillString}),
				headers: {'Content-Type': 'application/json'},
				onload: resolve,
			});
		});
	}
}

function getDriverIds(driversList) {
    return Array.from(driversList.querySelectorAll('.driver-item')).map(driver => getDriverId(driver));
}

function getDriverId(driverUl) {
    return +driverUl.closest('li').id.substr(4);
}


function showSpeed() {
    if (!SHOW_SPEED || $('#racingdetails').size() < 1 || $('#racingdetails').find('#speed_mph').size() > 0)
        return;

    // save some space
    $('#racingdetails').find('li.pd-name').each(function() {
        if ($(this).text() == 'Name:') $(this).hide();
        if ($(this).text() == 'Position:') $(this).text('Pos:');
        if ($(this).text() == 'Completion:') $(this).text('Compl:');
    });
    $('#racingdetails').append('<li id="speed_mph" class="pd-val"></li>');

    maybeClear();

    x = setInterval(function() {
        if ($('#racingupdatesnew').find('div.track-info').size() < 1) {
            maybeClear();
            return;
        }

        let laps = $('#racingupdatesnew').find('div.title-black').text().split(" - ")[1].split(" ")[0];
        let len = $('#racingupdatesnew').find('div.track-info').attr('data-length').replace('mi', '');
        let compl = $('#racingdetails').find('li.pd-completion').text().replace('%', '');

        if (last_compl >= 0) {
            let speed = (compl - last_compl) / 100 * laps * len * 60 * 60 * 1000 / period;
            $('#speed_mph').text(speed.toFixed(2) + 'mph');
        }
        last_compl = compl;
    }, period);
}

function showPenalty() {
    if ($('#racingAdditionalContainer').find('div.msg.right-round').size() > 0 &&
        $('#racingAdditionalContainer').find('div.msg.right-round').text().trim().startsWith('You have recently left')) {
        const penalty = GM_getValue('leavepenalty') * 1000;
        const now = Date.now();
        if (penalty > now) {
            const date = new Date(penalty);
            $('#racingAdditionalContainer').find('div.msg.right-round').text('You may join an official race at ' + formatTime(date) + '.');
        }
    }
}

function checkPenalty() {
    if (penaltyNotif) clearTimeout(penaltyNotif);
    const leavepenalty = GM_getValue('leavepenalty');
    const penaltyLeft = leavepenalty * 1000 - Date.now();
    if (NOTIFICATIONS && penaltyLeft > 0) {
        penaltyNotif = setTimeout(function() {
            GM_notification("You may join an official race now.", "Torn: Racing enhancements");
        }, penaltyLeft);
    }
}

function updateSkill(level) {
    const skill = Number(level).toFixed(4);
    const prev = GM_getValue('racinglevel');

    if (NOTIFICATIONS && prev !== "undefined" && typeof prev !== "undefined" && level > prev) {
        GM_notification("Your racing skill has increased by " + Number(level - prev).toFixed(4) + "!", "Torn: Racing enhancements");
    }
    GM_setValue('racinglevel', level);

    if ($('#racingMainContainer').find('div.skill').size() > 0) {
        $('#racingMainContainer').find('div.skill').text(skill);
    }
}

function parseRacingData(data) {
    updateSkill(data['user']['racinglevel']);

    const leavepenalty = data['user']['leavepenalty'];
    GM_setValue('leavepenalty', leavepenalty);
    checkPenalty();

    // calc, sort & show race results
    if (data.timeData.status >= 3) {
        const carsData = data.raceData.cars;
        const trackIntervals = data.raceData.trackData.intervals.length;
        let results = [], crashes = [];

        for (const playername in carsData) {
            const intervals = decode64(carsData[playername]).split(',');
            let raceTime = 0;
            let bestLap = 9999999999;

            if (intervals.length / trackIntervals == data.laps) {
                for (let i = 0; i < data.laps; i++) {
                    let lapTime = 0;
                    for (let j = 0; j < trackIntervals; j++) {
                        lapTime += Number(intervals[i * trackIntervals + j]);
                    }
                    bestLap = Math.min(bestLap, lapTime);
                    raceTime += Number(lapTime);
                }
                results.push([playername, raceTime, bestLap]);
            } else {
                crashes.push([playername, 'crashed']);
            }
        }

        // sort by time
        results.sort(compare);
        addExportButton(results, crashes);

        if (SHOW_RESULTS) {
            showResults(results);
            showResults(crashes, results.length);
        }
    }
}

// compare by time
function compare(a, b) {
    if (a[1] > b[1]) return 1;
    if (b[1] > a[1]) return -1;

    return 0;
}

function showResults(results, start = 0) {
    for (let i = 0; i < results.length; i++) {
        $('#leaderBoard').children('li').each(function() {
            const name = $(this).find('li.name').text().trim();
            if (name == results[i][0]) {
                const p = i + start + 1;
                let place;
                if (p != 11 && (p%10) == 1)
                    place = p + 'st';
                else if (p != 12 && (p%10) == 2)
                    place = p + 'nd';
                else if (p != 13 && (p%10) == 3)
                    place = p + 'rd';
                else
                    place = p + 'th';

                const result = typeof results[i][1] === 'number' ? formatTimeMsec(results[i][1] * 1000) : results[i][1];
                const bestLap = formatTimeMsec(results[i][2] * 1000);
                $(this).find('li.name').html($(this).find('li.name').html().replace(name, name + ' ' + place + ' ' + result + ' (best: ' + bestLap + ')'));
                return false;
            }
        });
    }
}

function addSettingsDiv() {
    if ($("#racingupdatesnew").size() > 0 && $('#racingEnhSettings').size() < 1) {
        const div = '<div style="font-size: 12px; line-height: 24px; padding-left: 10px; padding-right: 10px; background: repeating-linear-gradient(90deg,#242424,#242424 2px,#2e2e2e 0,#2e2e2e 4px); border-radius: 5px;">' +
              '<a id="racingEnhSettings" style="text-align: right; cursor: pointer;">Settings</a>' +
              '<div id="racingEnhSettingsContainer" style="display: none;"><ul style="color: #ddd;">' +
			  '<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="shareSkill"><label>Share Racing Skill</label></li>' +
              '<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="showSpeedChk"><label>Show current speed</label></li>' +
              '<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="showNotifChk"><label>Show notifications</label></li>' +
              '<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="showResultsChk"><label>Show results</label></li></ul></div></div>';
        $('#racingupdatesnew').prepend(div);

        $('#racingEnhSettingsContainer').find('input[type=checkbox]').each(function() {
            $(this).prop('checked', GM_getValue($(this).attr('id')) != 0);
        });

        $('#racingEnhSettings').on('click', function() {
            $('#racingEnhSettingsContainer').toggle();
        });
        $('#racingEnhSettingsContainer').on('click', 'input', function() {
            const id = $(this).attr('id');
            const checked = $(this).prop('checked');
            GM_setValue(id, checked ? 1 : 0);
        });
    }
}

function addExportButton(results, crashes) {
    if ($("#racingupdatesnew").size() > 0 && $('#downloadAsCsv').size() < 1) {
        let csv = '';
        for (let i = 0; i < results.length; i++) {
            const timeStr = formatTimeMsec(results[i][1] * 1000);
            csv += [i+1, results[i][0], timeStr].join(',') + '\n';
        }
        for (let i = 0; i < crashes.length; i++) {
            csv += [results.length + i + 1, crashes[i][0], crashes[i][1]].join(',') + '\n';
        }

        const myblob = new Blob([csv], {type: 'application/octet-stream'});
        const myurl = window.URL.createObjectURL(myblob);
        const exportBtn = `<a id="downloadAsCsv" href="${myurl}" style="float: right;" download="results.csv">Download results as CSV</a>`;
        $(exportBtn).insertAfter('#racingEnhSettings');
    }
}

'use strict';

// Your code here...
ajax((page, xhr) => {
    if (page != "loader") return;
	 const racingSkillElm = document.querySelector('.skill');
	 await saveRacingSkill(getUserIdFromCookie(), racingSkillElm.innerText);
	 insertRacingSkillsIntoCurrentDriversList();
	 // On change race tab, (re-)insert the racing skills if applicable:
     new MutationObserver(insertRacingSkillsIntoCurrentDriversList).observe(document.getElementById('racingAdditionalContainer'), {childList: true});
	
	 
	 
    $("#racingupdatesnew").ready(addSettingsDiv);
    $("#racingupdatesnew").ready(showSpeed);
    $('#racingAdditionalContainer').ready(showPenalty);
    try {
        parseRacingData(JSON.parse(xhr.responseText));
    } catch (e) {}
});

$("#racingupdatesnew").ready(addSettingsDiv);
$("#racingupdatesnew").ready(showSpeed);
$('#racingAdditionalContainer').ready(showPenalty);

checkPenalty();

