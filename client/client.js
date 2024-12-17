/*
* WhackerLink - WhackerLinkFiveM
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* Copyright (C) 2024 Caleb, K4PHP
*
*/

let isRadioOpen = false;
let isPttPressed = false;
let nuiFocused = false;
let lastPttTime = 0;
let pttPressStartTime = 0;
let currentCodeplug = {};
let inVehicle = false;
let sites = [];

const PTT_COOLDOWN_MS = 1000;
const MIN_PTT_DURATION_MS = 500;

function displayStartupMessage() {
    SendNuiMessage(JSON.stringify({
        type: 'showStartupMessage'
    }));
    setTimeout(() => {
        SendNuiMessage(JSON.stringify({
            type: 'hideStartupMessage'
        }));
    }, 3000);
}

on('onClientResourceStart', (resourceName) => {
    if (GetCurrentResourceName() !== resourceName) {
        return;
    }

    emitNet('getSitesConfig');
    displayStartupMessage();

    setTimeout(() => {
        if (currentCodeplug === null || currentCodeplug === undefined) {
            emit('chat:addMessage', {
                args: ['ALERT!', 'Make sure you set your codeplug!!'],
                color: [255, 0, 0]
            });
        }

        if (GetResourceKvpString(getKeyWithResourcePrefix('myRid')) === null || GetResourceKvpString(getKeyWithResourcePrefix('myRid')) === undefined) {
            emit('chat:addMessage', {
                args: ['ALERT!', 'Make sure you set your radio id!!'],
                color: [255, 0, 0]
            });
        }
    }, 5000);
});

RegisterNuiCallbackType('getPlayerLocation');

on('__cfx_nui:getPlayerLocation', (data, cb) => {
    const playerPed = PlayerPedId();
    const playerCoords = GetEntityCoords(playerPed);

    SendNuiMessage(JSON.stringify({
        type: 'playerLocation',
        latitude: playerCoords[0],
        longitude: playerCoords[1]
    }));

    cb({});
});

RegisterNuiCallbackType('receivedStsBcast');

on('__cfx_nui:receivedStsBcast', (data) => {
    setSiteStatusByName(data.status, data.site.Name);
});

onNet('receiveSitesConfig', (receivedSites) => {
    sites = receivedSites.sites;

    // console.log('Received sites config:', sites);

    if (receivedSites.config.siteBlips) {
        // console.warn("BLIPS ENABLED!");
        RemoveAllBlips();

        sites.forEach(site => {
            site.State = 1;

            // console.log(`Adding blip for site: ${site.name} at coordinates (${site.location.X}, ${site.location.Y}, ${site.location.Z})`);
            let blip = AddBlipForCoord(site.location.X, site.location.Y, site.location.Z);

            SetBlipSprite(blip, 767);
            SetBlipDisplay(blip, 4);
            SetBlipScale(blip, 1.0);
            SetBlipColour(blip, 3);
            SetBlipAsShortRange(blip, true);

            BeginTextCommandSetBlipName("STRING");
            AddTextComponentString(site.name);
            EndTextCommandSetBlipName(blip);
        });
    } else {
        // console.warn("BLIPS DISABLED!");
    }
    // console.debug('Received sites config:', sites);
});

RegisterCommand('toggle_radio', () => {
    ToggleRadio();
}, false);

RegisterCommand('emergency_toggle', () => {
    ActivateEmergency();
}, false);

RegisterCommand('set_rid', (source, args) => {
    if (args.length > 0) {
        setRid(args[0]);
    } else {
        emit('chat:addMessage', {
            args: ['Usage', '/set_rid <RID>'],
            color: [255, 0, 0]
        });
    }
}, false);

RegisterCommand('clear_codeplug', (source, args) => {
    currentCodeplug = null;
    SetResourceKvp(getKeyWithResourcePrefix('currentCodeplug'), JSON.stringify(currentCodeplug));
}, false);

RegisterCommand('site_status', (source, args) => {
    if (args.length > 1) {
        setSiteStatus(args[1], args[0]);
    } else {
        emit('chat:addMessage', {
            args: ['Usage', '/site_status site_index status(up = 1, down = 0, failsoft = 2)'],
            color: [255, 0, 0]
        });
    }
}, false);

RegisterCommand('change_battery', () => {
    resetBatteryLevel();
}, false);

onNet('open_radio', () => {
    ToggleRadio();
});

onNet('receiveCodeplug', (codeplug) => {
    // console.debug('Received new codeplug:', codeplug);
    currentCodeplug = codeplug;

    if (inVehicle) {
        currentCodeplug.currentModelConfig = currentCodeplug.inCarModeConfig;
        SendNuiMessage(JSON.stringify({type: 'setModel', model: currentCodeplug.radioWide.inCarMode, currentCodeplug}));
    } else {
        currentCodeplug.currentModelConfig = currentCodeplug.modelConfig;
        SendNuiMessage(JSON.stringify({type: 'setModel', model: currentCodeplug.radioWide.model, currentCodeplug}));
    }

    SetResourceKvp(getKeyWithResourcePrefix('currentCodeplug'), JSON.stringify(currentCodeplug));

    CloseRadio();
    OpenRadio();
});

RegisterNuiCallbackType('unFocus');

on('__cfx_nui:unFocus', (data, cb) => {
    SetNuiFocus(false, false);
    cb({});
});

RegisterKeyMapping('toggle_radio', 'Toggle Radio', 'keyboard', 'Y');
RegisterKeyMapping('emergency_toggle', 'Activate Emergency', 'keyboard', 'E');
RegisterKeyMapping('toggle_radio_focus', 'Toggle Radio Focus', 'keyboard', 'F');
RegisterKeyMapping('+ptt', 'Push-To-Talk', 'keyboard', 'N');

RegisterCommand('+ptt', () => {
    handlePTTDown();
}, false);

RegisterCommand('-ptt', () => {
    handlePTTUp();
}, false);

RegisterCommand('toggle_radio_focus', () => {
    if (!nuiFocused) {
        SendNuiMessage(JSON.stringify({type: 'radioFocused'}));
        nuiFocused = true;
        SetNuiFocus(true, true);
    } else {
        nuiFocused = false;
        SetNuiFocus(false, false);
    }
}, false);

function resetBatteryLevel() {
    SendNuiMessage(JSON.stringify({ type: 'resetBatteryLevel' }));
}

function ToggleRadio() {
    if (isRadioOpen) {
        CloseRadio();
    } else {
        OpenRadio();
    }
}

function ActivateEmergency() {
    SendNuiMessage(JSON.stringify({ type: 'activate_emergency' }));
}

function OpenRadio() {
    const codeplug = JSON.parse(GetResourceKvpString(getKeyWithResourcePrefix('currentCodeplug')));
    // console.log('CURRENT OPEN RADIO Codeplug:', codeplug)
    currentCodeplug = codeplug;
    if (codeplug === undefined || codeplug === null) {
        console.debug('No codeplug loaded');
        SendNuiMessage(JSON.stringify({type: 'FL_01/82'}));
        return;
    }

    SendNuiMessage(JSON.stringify({type: 'CLEAR_ERROR'}));
    SendNuiMessage(JSON.stringify({ type: 'openRadio', codeplug }));
    SendNuiMessage(JSON.stringify({ type: 'setRid', rid: GetResourceKvpString(getKeyWithResourcePrefix('myRid')) }));
    SetNuiFocus(false, false);
    isRadioOpen = true;

    emitNet('getSitesConfig');
}

function CloseRadio() {
    SendNuiMessage(JSON.stringify({ type: 'closeRadio' }));
    SetNuiFocus(false, false);
    isRadioOpen = false;
}

function handlePTTDown() {
    const currentTime = Date.now();
    const timeSinceLastPtt = currentTime - lastPttTime;

    if (!isPttPressed && timeSinceLastPtt > PTT_COOLDOWN_MS) {
        isPttPressed = true;
        pttPressStartTime = currentTime;

        setTimeout(() => {
            if (isPttPressed && (Date.now() - pttPressStartTime) >= MIN_PTT_DURATION_MS) {
                // console.debug('PTT press confirmed');
                SendNuiMessage(JSON.stringify({ type: 'pttPress' }));
                if (!inVehicle) {
                    playRadioAnimation();
                }
            }
        }, MIN_PTT_DURATION_MS + 100);
    } else {
        console.debug('PTT press ignored due to cooldown');
    }
}

function handlePTTUp() {
    const currentTime = Date.now();
    const pressDuration = currentTime - pttPressStartTime;

    if (isPttPressed) {
        if (pressDuration >= MIN_PTT_DURATION_MS) {
            SendNuiMessage(JSON.stringify({ type: 'pttRelease' }));
            lastPttTime = currentTime;
            stopRadioAnimation();
        } else {
            console.debug('PTT release ignored due to short press duration');
        }

        isPttPressed = false;
    }
}

setTick(async () => {
    if (currentCodeplug && currentCodeplug.radioWide && currentCodeplug.radioWide.model) {
        if (IsPedInAnyVehicle(PlayerPedId(), false)) {
            if (!inVehicle) {
                inVehicle = true;
                currentCodeplug.currentModelConfig = currentCodeplug.inCarModeConfig;
                SendNuiMessage(JSON.stringify({type: 'setModel', model: currentCodeplug.radioWide.inCarMode, currentCodeplug}));
            }
        } else {
            if (inVehicle) {
                inVehicle = false;
                currentCodeplug.currentModelConfig = currentCodeplug.modelConfig;
                SendNuiMessage(JSON.stringify({type: 'setModel', model: currentCodeplug.radioWide.model, currentCodeplug}));
            }
        }
    }
    checkPlayerRSSI();
    await Wait(100);
});

function calculateDbRssiLevel(distance, frequency) {
    const speedOfLight = 3e8;

    frequency = frequency * 1e6;

    const fspl = 20 * Math.log10(distance) + 20 * Math.log10(frequency) + 20 * Math.log10(4 * Math.PI / speedOfLight);

    const rssiAtOneMeter = -35;

    const rssi = rssiAtOneMeter - fspl;
    return Math.max(rssi, -120);
}

function checkPlayerRSSI() {
    const playerPed = PlayerPedId();
    const playerCoords = GetEntityCoords(playerPed);

    let closestSite = null;
    let minDistance = Infinity;

    sites.forEach(site => {
        if (site.State === 0) {
            return;
        }

        const siteCoords = site.location;
        const distance = Vdist(playerCoords[0], playerCoords[1], playerCoords[2], siteCoords.X, siteCoords.Y, siteCoords.Z);
        const distanceInMiles = distance / 1609.34;

        if (distanceInMiles < minDistance) {
            minDistance = distanceInMiles;
            closestSite = site;
        }
    });

    if (closestSite) {
        let rssiLevel;
        if (minDistance < closestSite.range * 0.2) {
            rssiLevel = 5;
        } else if (minDistance < closestSite.range * 0.4) {
            rssiLevel = 4;
        } else if (minDistance < closestSite.range * 0.6) {
            rssiLevel = 3;
        } else if (minDistance < closestSite.range * 0.8) {
            rssiLevel = 2;
        } else if (minDistance < closestSite.range) {
            rssiLevel = 1;
        } else {
            rssiLevel = 0;
        }

        const distanceInMeters = minDistance * 1609.34;
        const dbRssiLevel = calculateDbRssiLevel(distanceInMeters, 0.8549625);
        const failsoft = closestSite.State === 2;

        updateRSSIIcon(rssiLevel, closestSite, dbRssiLevel, failsoft);
    }
}

function updateRSSIIcon(level, site, dbRssi, failsoft) {
    SendNuiMessage(JSON.stringify({type: 'setRssiLevel', level: level, site: site, dbRssi, failsoft}));
    // console.debug('RSSI level:', level);
}

function playRadioAnimation() {
    const playerPed = PlayerPedId();
    if (!IsEntityPlayingAnim(playerPed, 'random@arrests', 'generic_radio_chatter', 3)) {
        RequestAnimDict('random@arrests');
        const interval = setInterval(() => {
            if (HasAnimDictLoaded('random@arrests')) {
                TaskPlayAnim(playerPed, 'random@arrests', 'generic_radio_chatter', 8.0, -8.0, -1, 49, 0, false, false, false);
                clearInterval(interval);
            }
        }, 100);
    }
}

function stopRadioAnimation() {
    const playerPed = PlayerPedId();
    if (IsEntityPlayingAnim(playerPed, 'random@arrests', 'generic_radio_chatter', 3)) {
        StopAnimTask(playerPed, 'random@arrests', 'generic_radio_chatter', 3.0);
    }
}

function setRid(newRid) {
    myRid = newRid;
    SetResourceKvp(getKeyWithResourcePrefix('myRid'), myRid);
    SendNuiMessage(JSON.stringify({ type: 'setRid', rid: GetResourceKvpString(getKeyWithResourcePrefix('myRid')) }));
}

function setSiteStatus(status, sid) {
    sites[sid].State = Number(status);
    SendNuiMessage(JSON.stringify({ type: 'setSiteStatus', sid, status, sites }));
}

function setSiteStatusByName(status, name) {
    const site = Object.values(sites).find(site => site && site.name === name);

    if (site) {
        site.State = Number(status);
    } else {
        console.error(`Site with name "${name}" not found.`);
    }
}

function RemoveAllBlips() {
    let blipHandle = GetFirstBlipInfoId(1);
    while (DoesBlipExist(blipHandle)) {
        RemoveBlip(blipHandle);
        blipHandle = GetNextBlipInfoId(1);
    }
}

function getKeyWithResourcePrefix(key) {
    const resourceName = GetCurrentResourceName();
    return `${resourceName}_${key}`;
}