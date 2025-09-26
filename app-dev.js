// --- Globals for metadata and PDF generation ---
// Version 2.1 (mei-friend-inspired MIDI highlighting)

var globalTitle = '';
var globalTuneTitle = '';
var globalTextSource = '';
var globalTextSourceDate = '';
var globalTuneSource = '';
var globalTuneSourceDate = '';
var globalTeiID = '';
var globalPsTune = '';
var globalSelStanzas = [];

// --- Verovio toolkits, page state, and MIDI highlight state ---
let vrvToolkit, tk_pdf;
let page = 1;
let zoom = 50;
let trInterval = "0";
let timemap = [];
let timemapIdx = 0;
let lastOnsetIdx = 0;
let lastReportedTime = 0; // ms
let highlightRAF = null;
const highlightId = 'data-highlight';
let playbackOnLoad = false;
let currentXmlData = "";
let volumes = new Map();

// --- Audio context timing for synchronization ---
let audioStartTime = 0; // Tone.js audio context start time
let playbackStartTime = 0; // Wall-clock time when playback started

// --- Debug timing analysis ---
let timingDebug = false; // Set to true to enable timing debug logs
let lastDebugTime = 0;

// --- Helper function to get synchronized audio time ---
function getSynchronizedAudioTime() {
    const player = document.getElementById('verovio-midi-player');
    if (!player) return 0;
    
    // If we have audio context timing, use it for better precision
    if (audioStartTime > 0 && Tone && Tone.now) {
        const currentAudioTime = Tone.now();
        const elapsedAudioTime = (currentAudioTime - audioStartTime) * 1000; // Convert to ms
        
        // Debug timing comparison if enabled
        if (timingDebug && Date.now() - lastDebugTime > 1000) { // Log once per second
            const playerTime = (player.currentTime || 0) * 1000;
            const timeDiff = Math.abs(elapsedAudioTime - playerTime);
            console.log(`Timing sync - Audio Context: ${elapsedAudioTime.toFixed(2)}ms, Player: ${playerTime.toFixed(2)}ms, Diff: ${timeDiff.toFixed(2)}ms`);
            lastDebugTime = Date.now();
        }
        
        return elapsedAudioTime;
    }
    
    // Fallback to player currentTime
    return (player.currentTime || 0) * 1000;
}

// --- Enable/disable timing debug ---
function enableTimingDebug(enable = true) {
    timingDebug = enable;
    console.log(`Timing debug ${enable ? 'enabled' : 'disabled'}`);
}

// --- Handle tempo changes and seeking by detecting large time jumps ---
function detectTimeJump(currentTime, lastTime) {
    const timeDiff = Math.abs(currentTime - lastTime);
    const threshold = 100; // 100ms threshold for detecting jumps
    
    if (timeDiff > threshold && lastTime > 0) {
        if (timingDebug) {
            console.log(`Time jump detected: ${timeDiff.toFixed(2)}ms`);
        }
        return true;
    }
    return false;
}

// --- Reset highlighting state after time jump ---
function resetHighlightingState() {
    // Clear all current highlights
    unHighlightAllElements();
    
    // Reset timemap index to find correct position
    timemapIdx = 0;
    lastReportedTime = 0;
    
    if (timingDebug) {
        console.log('Highlighting state reset after time jump');
    }
}

// --- Expose debugging utilities globally for browser console access ---
window.midiHighlightDebug = {
    enableDebug: enableTimingDebug,
    getSyncTime: getSynchronizedAudioTime,
    getTimemapInfo: () => ({
        length: timemap.length,
        currentIndex: timemapIdx,
        lastReportedTime: lastReportedTime,
        audioStartTime: audioStartTime,
        playbackStartTime: playbackStartTime
    }),
    resetState: resetHighlightingState,
    getCurrentlyHighlighted: () => Array.from(document.querySelectorAll('g.note.currently-playing')).map(n => n.id)
};

// --- DOMContentLoaded: All event handlers and UI set up here ---
document.addEventListener("DOMContentLoaded", () => {
    verovio.module.onRuntimeInitialized = () => {
        vrvToolkit = new verovio.toolkit();
        tk_pdf = new verovio.toolkit();
        // Set flag or call your main setup/render logic here!
        verovioToolkitReady = true;


    // --- PDF modal controls ---
    const paperSizeModal = document.getElementById('paperSizeModal');
    const printPdfButton = document.getElementById('printPDF');
    const cancelPdfButton = document.getElementById('cancelPdfButton');
    const generatePdfButton = document.getElementById('generatePdfButton');

    printPdfButton.addEventListener('click', () => {
        paperSizeModal.style.display = 'flex';
    });
    cancelPdfButton.addEventListener('click', () => {
        paperSizeModal.style.display = 'none';
    });
    generatePdfButton.addEventListener('click', async function() {
        paperSizeModal.style.display = 'none';
        const selectedSizeElement = document.querySelector('input[name="paperSize"]:checked');
        const selectedPaperSize = selectedSizeElement ? selectedSizeElement.value : 'LETTER';
        await generatePDF(selectedPaperSize);
    });

    // --- REPLACE THE COMMENTED CODE BELOW WITH LYDIA CONTROLS  ---
    /*const playMIDIButton = document.getElementById("playMIDI");
    if (playMIDIButton) {
        playMIDIButton.addEventListener("click", async function() {
            vrvToolkit.setOptions({ midiTempoAdjustment: midiTempoAdjustment });
            vrvToolkit.redoLayout();
            setTimemap(vrvToolkit.renderToTimemap());
    
            // Regenerate MIDI for the player
            const base64midi = vrvToolkit.renderToMIDI();
            const player = document.getElementById('verovio-midi-player');
            player.src = 'data:audio/midi;base64,' + base64midi;
            if (typeof player.load === "function") player.load();
    
            await loadAudioAndPlayHandler();
        });
    }
    
    const pauseMIDIButton = document.getElementById("pauseMIDI");
    if (pauseMIDIButton) {
        pauseMIDIButton.addEventListener("click", function() {
            stopMIDIHandler();
        });
    }*/

    // --- Navigation and Zoom controls ---
    window.addEventListener("resize", debounce(applyZoom, 200));
    const zoomInButton = document.getElementById("zoomIn");
        if (zoomInButton) {
            zoomInButton.addEventListener("click", zoomIn);
        }
    
    const zoomOutButton = document.getElementById("zoomOut");
        if (zoomOutButton) {
            zoomOutButton.addEventListener("click", zoomOut);
        }
    
    // Pagination controls
    const firstPageButton = document.getElementById("firstPage");
        if (firstPageButton) {
            firstPageButton.addEventListener("click", firstPage);
        }
    
    const prevPageButton = document.getElementById("prevPage");
        if (prevPageButton) {
            prevPageButton.addEventListener("click", prevPage);
        }
    
    const nextPageButton = document.getElementById("nextPage");
        if (nextPageButton) {
            nextPageButton.addEventListener("click", nextPage);
        }
    
    const lastPageButton = document.getElementById("lastPage");
        if (lastPageButton) {
            lastPageButton.addEventListener("click", lastPage);
        }
    
    // Transpose controls
    const trUpButton = document.getElementById("trUp");
        if (trUpButton) {
            trUpButton.addEventListener("click", trUp);
        }
    
    const trDownButton = document.getElementById("trDown");
        if (trDownButton) {
            trDownButton.addEventListener("click", trDown);
        }

    // --- Keyboard navigation (arrows, zoom, etc.) ---
    window.addEventListener("keyup", function(event) {
        processBasicEvents(event);
    });

    // --- Respond to window resize with layout/zoom update ---
    window.addEventListener("resize", () => {
        applyZoom();
    });

    // --- Initial file load (or trigger via UI as desired) ---
    //loadFile();

    };
});

function downloadVerovioMidiFile() {
    if (!vrvToolkit) return;
    // Generate MIDI as base64
    const base64midi = vrvToolkit.renderToMIDI();
    // Convert base64 to binary
    function base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
    const midiArrayBuffer = base64ToArrayBuffer(base64midi);
    // Create Blob and trigger download
    const blob = new Blob([midiArrayBuffer], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (globalTitle || "splitleaf") + ".mid";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function setFormFromURLParamsAndTriggerOnchange() {
    const params = new URLSearchParams(window.location.search);

    // Set pssource from URL params
    const psSourceParam = params.get('pssource') || params.get('psSource');
    if (psSourceParam) {
        const psSourceInput = document.getElementById('pssource');
        if (psSourceInput) {
            psSourceInput.value = psSourceParam;
            // Optionally trigger onchange
            if (typeof psSourceInput.onchange === "function" || psSourceInput.hasAttribute("onchange")) {
                psSourceInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    // Set pstext from URL params
    const psTextParam = params.get('pstext');
    if (psTextParam) {
        const psTextSelect = document.getElementById('pstext');
        if (psTextSelect) {
            psTextSelect.value = psTextParam;
            // Optionally trigger onchange
            if (typeof psTextSelect.onchange === "function" || psTextSelect.hasAttribute("onchange")) {
                psTextSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }
}

function applyTuneAndStanzaParameters() {
    const params = new URLSearchParams(window.location.search);

    // Set tune
    const pstuneParam = params.get('pstune');
    if (pstuneParam) {
        const pstuneInput = document.getElementById('pstune');
        if (pstuneInput) {
            pstuneInput.value = pstuneParam;
            // Optionally trigger onchange
            if (typeof pstuneInput.onchange === "function" || pstuneInput.hasAttribute("onchange")) {
                pstuneInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    // Select stanzas (checkboxes)
    const selStanzasParam = params.get('selectVerses') || params.get('selStanzas');
    if (selStanzasParam) {
        const stanzaValues = selStanzasParam.replace(/['"]/g, '').split(',').map(s => s.trim());
        const verseSelectionContainer = document.getElementById('verseSelection');
        if (verseSelectionContainer) {
            const checkboxes = verseSelectionContainer.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = stanzaValues.includes(checkbox.value);
            });
        }
    }
}

function applyStanzaSelectionsFromURL() {
    const params = new URLSearchParams(window.location.search);
    const selStanzasParam = params.get('selectVerses') || params.get('selStanzas');
    if (selStanzasParam) {
        // Clean up the parameter format
        const stanzaValues = selStanzasParam.replace(/['"]/g, '').split(',').map(s => s.trim());

        // Deselect all using your toggle function
        const indVersesDiv = document.getElementById('indVerses');
        const selectAllBox = document.getElementById('selectAll');
        if (indVersesDiv && selectAllBox) {
            selectAllBox.checked = false; // Uncheck "Select All"
            toggle(indVersesDiv);         // Deselect all stanza checkboxes
        }

        // Now, select only those matching stanzaValues
        const checkboxes = indVersesDiv.getElementsByTagName("input");
        for (let a = 0; a < checkboxes.length; a++) {
            if (stanzaValues.includes(checkboxes[a].value)) {
                checkboxes[a].checked = true;
                // Optionally trigger onchange
                if (typeof checkboxes[a].onchange === "function" || checkboxes[a].hasAttribute("onchange")) {
                    checkboxes[a].dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }

        // Optionally, update the display
        if (document.getElementById("selectVerses")) {
            document.getElementById("selectVerses").innerHTML = stanzaValues.join(", ");
        }
    }
}

// --- Call this after all dropdowns/lists are populated ---
// If you use async data loading, call this from a callback or after a Promise resolves.
// For synchronous setup, a short timeout after DOMContentLoaded is sufficient.

function autoRenderPsalmFromURL() {
    setFormFromURLParamsAndTriggerOnchange();

    // Optionally: If all required fields are filled, trigger renderPsalm
    if (
        document.getElementById('pssource')?.value &&
        document.getElementById('pstext')?.value &&
        document.getElementById('pstune')?.value &&
        Array.from(document.getElementsByName('stanzas')).some(cb => cb.checked)
    ) {
        renderPsalm();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // For async dropdown population, replace this with a callback/event!
    setTimeout(autoRenderPsalmFromURL, 800); // Adjust delay as needed for your content
});

// Main function: checks URL and triggers renderPsalm if autoGen is present
async function URLVariableFunction() {
    const params = new URLSearchParams(window.location.search);

    if (!params.has('autoGen')) return;

    let teiID = params.get('teiID') || params.get('teiID');
    let selStanzas = params.get('selStanzas') || params.get('selectVerses') || params.get('stanzas');
    let psTune = params.get('psTune');

    let selStanzasArr = null;
    if (selStanzas) {
        selStanzasArr = selStanzas.replace(/['"]/g, '').split(',').map(s => s.trim());
    }

    renderPsalm({
        teiID: teiID,
        selStanzas: selStanzasArr,
        psTune: psTune,
        autoGen: true
    });
}

// Example: adjust your renderPsalm to accept an argument object
function renderPsalm({ teiID, selStanzas, psTune, autoGen } = {}) {
    // If these variables are provided, use them; else fall back to menu fields
    // ... your custom logic here ...
}

// Call the function on load (after DOM is ready)
document.addEventListener("DOMContentLoaded", () => {
    URLVariableFunction();
});


function setTimemap(tm) {
    timemap = tm || [];
    determineLastOnsetIdx();
    timemapIdx = 0;
    
    // Reset timing state when timemap changes
    lastReportedTime = 0;
    
    // Add validation for timemap entries
    if (timemap.length > 0) {
        console.log(`Timemap loaded with ${timemap.length} entries`);
        // Basic validation - check for required tstamp property
        const invalidEntries = timemap.filter(entry => !entry || entry.tstamp === undefined);
        if (invalidEntries.length > 0) {
            console.warn(`Found ${invalidEntries.length} invalid timemap entries`);
        }
    }
}

function determineLastOnsetIdx() {
    let i = timemap.length;
    while (i-- > 0) {
        if ('on' in timemap[i]) {
            lastOnsetIdx = i;
            break;
        }
    }
}

function highlightNote(note, id = '') {
    if (!note) return;
    note.classList.add('currently-playing');
    if (id) note.setAttribute(highlightId, id);
    note.querySelectorAll('g').forEach((g) => g.classList.add('currently-playing'));
}

function unhighlightNote(note) {
    if (!note) return;
    note.classList.remove('currently-playing');
    note.removeAttribute(highlightId);
    note.querySelectorAll('.currently-playing').forEach((g) => g.classList.remove('currently-playing'));
}

function unHighlightAllElements() {
    document.querySelectorAll('.currently-playing').forEach((g) => g.classList.remove('currently-playing'));
}

function stopMidiHighlighting() {
    if (highlightRAF) cancelAnimationFrame(highlightRAF);
    highlightRAF = null;
    timemapIdx = 0;
    lastReportedTime = 0;
    unHighlightAllElements();
}

function getTimeFromTimemap(id) {
    for (let e of timemap) {
        if (e.hasOwnProperty('on') && e.on.includes(id)) {
            return e.tstamp;
        }
    }
    return -1;
}

function getPageForTime(t) {
    // Verovio's timemap entries sometimes include page info
    // Find the last timemap entry <= t that has a 'page' property and return it
    let p = 1;
    for (let i = 0; i < timemap.length; i++) {
        if (timemap[i].tstamp <= t && timemap[i].page !== undefined) {
            p = timemap[i].page;
        }
    }
    return p;
}

// --- UPDATE THE FOLLOWING WITH SIMILAR FUNCTIONS IN LYDIA ---
/*function seekMidiPlaybackToTime(t) {
    const player = document.getElementById('verovio-midi-player');
    if (player) {
        if (player.playing) {
            player.stop();
            player.currentTime = t / 1000;
            player.start();
        } else {
            player.currentTime = t / 1000;
        }
    }
    timemapIdx = 0;
    unHighlightAllElements();
}

function updateMidiBpmAllScoreDefInMei(meiXmlString, bpm) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(meiXmlString, "application/xml");
    const scoreDefs = xmlDoc.querySelectorAll('scoreDef');
    scoreDefs.forEach(sd => sd.setAttribute('midi.bpm', bpm));
    return new XMLSerializer().serializeToString(xmlDoc);
}

function initializeInstrumentsAndVolumes(instrumentsArray) {
    console.log('Instruments:', instrumentsArray);
    console.log('Number of instruments:', instrumentsArray.length);
    
    volumes.clear();
    
    instrumentsArray.forEach((instrument, index) => {
        const gainNode = new Tone.Gain(1).toDestination();
        volumes.set(index, gainNode);
        
        if (instrument && typeof instrument.connect === 'function') {
            instrument.disconnect(); // Disconnect from current destination
            instrument.connect(gainNode);
        }
        
        console.log(`Created volume control for instrument ${index}`);
    });
    
    console.log('Volumes Map initialized with channels:', Array.from(volumes.keys()));
}


function setMidiVoiceVolume(channelIndex, volume) {
    console.log(`setMidiVoiceVolume called with channel: ${channelIndex}, volume: ${volume}`);
    
    const player = document.getElementById('verovio-midi-player');
    
    if (!player || !player.instrumentsInfo) {
        console.error('MIDI player or instrumentsInfo not found');
        return false;
    }
    
    try {
        // Direct approach: use the volume property on each instrument
        if (player.instrumentsInfo && player.instrumentsInfo[channelIndex]) {
            const instrument = player.instrumentsInfo[channelIndex];
            console.log(`Setting volume on instrument ${channelIndex}:`, instrument);
            
            // Set the volume directly on the instrument
            instrument.volume = volume;
            console.log(`✅ Successfully set volume for channel ${channelIndex} to ${volume}`);
            console.log(`Instrument ${channelIndex} volume is now:`, instrument.volume);
            return true;
        } else {
            console.error(`Instrument ${channelIndex} not found in instrumentsInfo`);
            console.log('Available instruments:', player.instrumentsInfo.length);
            return false;
        }
        
    } catch (error) {
        console.error(`Error setting volume for channel ${channelIndex}:`, error);
        return false;
    }
}*/

// REPLACE THIS LOGIC WITH WHAT LYDIA NEEDS
/*function applyStoredVolumes() {
    console.log('Attempting to apply stored volumes...');
    
    const player = document.getElementById('verovio-midi-player');
    if (!player || !player.player || !window.storedVolumes) {
        return false;
    }
    
    const internalPlayer = player.player;
    let appliedCount = 0;
    
    // Check if programOutputs are now available
    if (internalPlayer.programOutputs && internalPlayer.programOutputs.length > 0) {
        console.log('programOutputs now available:', internalPlayer.programOutputs.length);
        
        Object.keys(window.storedVolumes).forEach(channelIndex => {
            const volume = window.storedVolumes[channelIndex];
            const idx = parseInt(channelIndex);
            
            if (internalPlayer.programOutputs[idx]) {
                const programOutput = internalPlayer.programOutputs[idx];
                console.log(`programOutput ${idx}:`, programOutput);
                console.log(`programOutput ${idx} properties:`, Object.getOwnPropertyNames(programOutput));
                
                // Try different ways to access the gain
                if (programOutput.gain && programOutput.gain.setValueAtTime) {
                    const audioContext = programOutput.context || internalPlayer.output.context;
                    programOutput.gain.setValueAtTime(volume, audioContext.currentTime);
                    console.log(`✅ Applied stored volume ${volume} to channel ${idx}`);
                    appliedCount++;
                } else if (programOutput.gainNode && programOutput.gainNode.gain) {
                    const audioContext = programOutput.gainNode.context;
                    programOutput.gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
                    console.log(`✅ Applied stored volume ${volume} to channel ${idx} gainNode`);
                    appliedCount++;
                }
            }
        });
    }
    
    return appliedCount > 0;
}

function setupInstruments(midiData) {
    const instruments = new Map();
    const volumes = new Map();
    
    // Create synths for each channel found in MIDI data
    const channels = [...new Set(midiData.tracks.flatMap(track => 
        track.events.filter(event => event.type === 'noteOn')
                   .map(event => event.channel)
    ))];
    
    channels.forEach(channel => {
        const gain = new Tone.Gain(1).toDestination();
        const synth = new Tone.PolySynth(Tone.Synth).connect(gain);
        
        instruments.set(channel, synth);
        volumes.set(channel, gain);
    });
    
    console.log(`Instruments: [${channels.join(', ')}]`);
    console.log(`Number of instruments: ${channels.length}`);
    
    return { instruments, volumes };
}

function setChannelVolume(channel, volume) {
    const gain = volumeGains.get(channel); // Your volume gains map
    if (gain) {
        gain.gain.setValueAtTime(volume, Tone.now());
        console.log(`Set volume for channel ${channel}: ${volume}`);
    } else {
        console.error(`Could not set volume for channel ${channel} - gain not found`);
    }
}

function setGlobalMidiVolume(volume) {
    // volume: 0.0 (mute) ... 1.0 (full)
    let dbValue = (volume === 0) ? -Infinity : 20 * Math.log10(volume);
    const player = document.getElementById('verovio-midi-player');
    if (!player || !player.player || !player.player.output || !player.player.output.volume) return;

    player.player.output.volume.value = dbValue;
    console.log("Set global output volume to", dbValue, "dB");
}*/

function highlightNotesAtMidiPlaybackTime(ev = false) {
    const player = document.getElementById('verovio-midi-player');
    let t;
    if (ev && ev.detail && ev.detail.note && ev.detail.note.startTime !== undefined) {
        t = ev.detail.note.startTime * 1000;
    } else if (player) {
        // Use synchronized audio time instead of player.currentTime
        t = getSynchronizedAudioTime();
    } else {
        return;
    }
    
    // Add bounds checking for timemap
    if (!timemap || timemap.length === 0) {
        return;
    }
    
    // Detect time jumps (seeking, tempo changes) and reset state if needed
    if (detectTimeJump(t, lastReportedTime)) {
        resetHighlightingState();
    }
    
    const currentlyHighlightedNotes = Array.from(document.querySelectorAll('g.note.currently-playing'));
    const firstNoteOnPage = document.querySelector('.note');

    // Add small lookahead for smoother highlighting (16ms ≈ one frame at 60fps)
    const lookaheadTime = 16;
    const tWithLookahead = t + lookaheadTime;

    // Efficiently advance timemapIdx with better bounds checking
    if (t < lastReportedTime) timemapIdx = 0;
    lastReportedTime = t;
    while (
        timemapIdx < timemap.length - 1 &&
        timemap[timemapIdx] &&
        timemap[timemapIdx].tstamp !== undefined &&
        Math.round(timemap[timemapIdx].tstamp) + 1 < Math.round(tWithLookahead)
    ) {
        timemapIdx++;
    }

    // Unhighlight notes whose off event has occurred
    let ix = timemapIdx;
    while (ix >= 0 && timemap.length > 0) {
        if (timemap[ix] && 'off' in timemap[ix] && timemap[ix].tstamp <= t) {
            let i = currentlyHighlightedNotes.length - 1;
            while (i >= 0) {
                if (timemap[ix].off.includes(currentlyHighlightedNotes[i].getAttribute(highlightId))) {
                    unhighlightNote(currentlyHighlightedNotes[i]);
                    currentlyHighlightedNotes.splice(i, 1);
                }
                i = Math.min(currentlyHighlightedNotes.length - 1, --i);
            }
        }
        if (timemap[ix] && 'on' in timemap[ix] && firstNoteOnPage && timemap[ix].on.includes(firstNoteOnPage.id)) {
            break;
        }
        ix--;
    }

    // At the last onset, schedule future unhighlights for remaining "off" events
    if (timemapIdx === lastOnsetIdx) {
        let j = timemapIdx;
        while (j++ < timemap.length - 1) {
            if (timemap[j] && 'off' in timemap[j]) {
                timemap[j].off.forEach((id) => {
                    let note = document.getElementById(id);
                    // Use audio context timing for scheduling if available
                    const delay = timemap[j].tstamp - t;
                    if (delay > 0) {
                        setTimeout(() => unhighlightNote(note), delay, note);
                    }
                });
            }
            // Stop the player at the end
            if (j === timemap.length - 1) {
                const delay = timemap[j].tstamp - t;
                if (delay > 0) {
                    setTimeout(() => player.stop(), delay, player);
                }
            }
        }
    }

    // Highlight notes at current timemap event (using lookahead)
    let closestTimemapTime = timemap[timemapIdx];
    if (closestTimemapTime && 'on' in closestTimemapTime && closestTimemapTime.tstamp <= tWithLookahead) {
        for (let id of closestTimemapTime['on']) {
            let note = document.getElementById(id);
            if (note && !note.classList.contains('currently-playing')) {
                highlightNote(note, id);
                // Schedule unhighlight for notes that end later (only if not immediately followed by another "on")
                for (let i = timemapIdx + 1; i < timemap.length - 1; i++) {
                    if (timemap[i] && 'off' in timemap[i] && timemap[i].off.includes(id)) {
                        if (!('on' in timemap[i])) {
                            const delay = timemap[i].tstamp - t;
                            if (delay > 0) {
                                setTimeout(() => unhighlightNote(note), delay, note);
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
}

// --- Highlight polling loop (use requestAnimationFrame for best sync) ---
function midiHighlightLoop() {
    const player = document.getElementById('verovio-midi-player');
    if (player && !player.paused && !player.ended) {
        highlightNotesAtMidiPlaybackTime();

        // --- PAGE ADVANCE LOGIC (NOTE-BASED) ---
        // Find "on" notes from timemap at current MIDI time using synchronized timing
        let t = getSynchronizedAudioTime();
        let onNotes = [];
        
        // Add bounds checking for timemap
        if (timemap && timemap.length > 0) {
            for (let i = 0; i < timemap.length; i++) {
                if (timemap[i] && timemap[i].tstamp <= t && timemap[i].on) {
                    onNotes = timemap[i].on; // last event before t
                }
            }
        }
        
        let pageToShow = page;
        for (let id of onNotes) {
            if (noteIdToPage[id] && noteIdToPage[id] !== page) {
                pageToShow = noteIdToPage[id];
                break;
            }
        }
        if (pageToShow !== page) {
            page = pageToShow;
            loadPage();
        }
        // --- END PAGE ADVANCE LOGIC ---

        highlightRAF = requestAnimationFrame(midiHighlightLoop);
    } else {
        highlightRAF = null;
        // Reset timing state when playback stops
        audioStartTime = 0;
        playbackStartTime = 0;
    }
}

function startMidiHighlighting() {
    if (highlightRAF) cancelAnimationFrame(highlightRAF);
    highlightNotesAtMidiPlaybackTime();
    highlightRAF = requestAnimationFrame(midiHighlightLoop);
}

function stopMidiHighlighting() {
    if (highlightRAF) cancelAnimationFrame(highlightRAF);
    unHighlightAllElements();
}

let noteIdToPage = {};
function buildNoteIdToPageMap() {
    noteIdToPage = {};
    let pageCount = vrvToolkit.getPageCount();
    for (let p = 1; p <= pageCount; p++) {
        let svg = vrvToolkit.renderToSVG(p, {});
        let tempDiv = document.createElement('div');
        tempDiv.innerHTML = svg;
        let notes = tempDiv.querySelectorAll('g.note[id]');
        notes.forEach(note => {
            noteIdToPage[note.id] = p;
        });
    }
}

// --- Core Verovio and UI functions (excluding PDF function and after) ---

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function setOptions() {
    let maxWidth = 1150;
    let maxHeight = 900
    let containerWidth = Math.floor(window.innerWidth * 0.85);
    let containerHeight = Math.floor(window.innerHeight * 0.9);
    let pageWidth = Math.min(containerWidth, maxWidth);
    let pageHeight = Math.min(containerHeight, maxHeight);

    let options = {
        pageHeight: pageHeight,
        pageWidth: pageWidth,
        scale: zoom,
        adjustPageHeight: true,
        transpose: trInterval,
        spacingLinear: 0.35,
        scaleToPageSize: true,
        svgAdditionalAttribute: ["note@pname", "note@oct"]
    };
    
    vrvToolkit.setOptions(options);
}

function loadData(data) {
    
    setOptions();
    vrvToolkit.loadData(data);
    tk_pdf.loadData(data);
    setTimemap(vrvToolkit.renderToTimemap());
    buildNoteIdToPageMap();
    page = 1;
    loadPage();
}

function loadPage() {
    let svg = vrvToolkit.renderToSVG(page, {});
    const container = document.getElementById("svg_output");
    container.innerHTML = ""; // Clear old content
    
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = svg; // svg is a string containing the SVG markup
    
    // Extract the SVG node and append it fresh
    const svgNode = tempDiv.querySelector("svg");
    if (svgNode) {
      // Optionally: assign a unique key/id if you want to mimic the React solution
      svgNode.setAttribute("data-key", Date.now()); // or use a random string
      container.appendChild(svgNode);
    } else {
      // fallback: just append all child nodes if not a single SVG root
      while (tempDiv.firstChild) {
        container.appendChild(tempDiv.firstChild);
      }
    }
    unHighlightAllElements();
}

function loadFile() {
    renderPsalm();
    //let fullData = new XMLSerializer().serializeToString(xmlData);
    //loadData(fullData);
}

function nextPage() {
    stopMIDIHandler()
    if (page < vrvToolkit.getPageCount()) {
        page++;
        loadPage();
    }
}
function prevPage() {
     stopMIDIHandler();
    if (page > 1) {
        page--;
        loadPage();
    }
}
function firstPage() {
    stopMIDIHandler();
    page = 1;
    loadPage();
}
function lastPage() {
    stopMIDIHandler();
    page = vrvToolkit.getPageCount();
    loadPage();
}
function applyZoom() {
    stopMIDIHandler();
    setOptions();
    vrvToolkit.redoLayout();
    buildNoteIdToPageMap();
    page = 1;
    loadPage();
}
function zoomOut() {
    if (zoom > 20) {
        zoom -= 5;
        applyZoom();
    }
}
function zoomIn() {
    if (zoom < 80) {
        zoom += 5;
        applyZoom();
    }
}
function trUp() {
    trInterval = String(Number(trInterval) + 1);
    setOptions();
    loadData(currentXmlData);
}
function trDown() {
    trInterval = String(Number(trInterval) - 1);
    setOptions();
    loadData(currentXmlData);
}

function processBasicEvents(event) {
    if (event.ctrlKey && event.keyCode == 37) {
        firstPage();
    } else if (event.keyCode == 37) {
        prevPage();
    } else if (event.ctrlKey && event.keyCode == 39) {
        lastPage();
    } else if (event.keyCode == 39) {
        nextPage();
    } else if ([107, 187, 61].includes(event.keyCode)) {
        zoomIn();
    } else if ([109, 189, 173].includes(event.keyCode)) {
        zoomOut();
    }
}

// --- MIDI control handlers (mei-friend-inspired approach) ---
function stopMIDIHandler() {
    const player = document.getElementById('verovio-midi-player');
    if (player && typeof player.stop === "function") player.stop();
    stopMidiHighlighting();
    
    // Reset timing state for clean restart
    audioStartTime = 0;
    playbackStartTime = 0;
    lastReportedTime = 0;
    timemapIdx = 0;
}

async function loadAudioAndPlayHandler() {
    const player = document.getElementById('verovio-midi-player');
    
    
    try { await Tone.start(); } catch (error) {}
    // Generate MIDI and load into player
    let base64midi = vrvToolkit.renderToMIDI();
    player.src = 'data:audio/midi;base64,' + base64midi;
    if (typeof player.load === "function") player.load();
    if (typeof player.stop === "function") player.stop();
    // Start playbook and highlighting after a short delay (for instrument init)
    setTimeout(async () => {
        console.log('Setting up player volume controls');
        
        // Create a simple mapping for our volume function
        const playerChannels = new Map();
        playerChannels.set(0, { name: 'treble', player: player });
        playerChannels.set(1, { name: 'bass', player: player });
        volumes = playerChannels;
        console.log('✅ Player volume controls ready');
        
        // DEBUG: Check what's in instrumentsInfo
        if (player.instrumentsInfo) {
            console.log('instrumentsInfo details:');
            player.instrumentsInfo.forEach((info, idx) => {
                console.log(`Instrument ${idx}:`, info);
                console.log(`Instrument ${idx} properties:`, Object.getOwnPropertyNames(info));
            });
        }
    
        // Load samples if using SoundFontPlayer
        if (typeof player.loadSamples === "function" && player.noteSequence) {
            await player.loadSamples(player.noteSequence);
        }
        
        document.getElementById("trebleVolume").disabled = false;
        document.getElementById("bassVolume").disabled = false;
        
        // Set initial volumes directly
        setMidiVoiceVolume(0, getVoiceVolume("trebleVolume"));
        setMidiVoiceVolume(1, getVoiceVolume("bassVolume"));
    
        // Initialize timing state for synchronization
        audioStartTime = Tone.now();
        playbackStartTime = Date.now();
        
        // Start playback and highlighting
        if (typeof player.start === "function") player.start();
        
        lastReportedTime = 0;
        timemapIdx = 0;
        highlightNotesAtMidiPlaybackTime();
        startMidiHighlighting();
    }, 400);
}


// --- When you load new MEI, update SVG, timemap, and clear highlights. ---
function renderAndDisplayMEI(meiXML) {
    vrvToolkit.loadData(meiXML);
    tk_pdf.loadData(meiXML);
    setTimemap(vrvToolkit.renderToTimemap());
    document.getElementById("svg_output").innerHTML = vrvToolkit.renderToSVG(page);
    unHighlightAllElements();
}


// --- PDF generation (unchanged from your code) ---
async function generatePDF(selectedPaperSize) {

    if (!tk_pdf || tk_pdf.getMEI() === '') {
        // IMPORTANT: Replace alert() with a custom modal or message box in a real application.
        alert("Verovio PDF toolkit is not ready or no MEI data loaded. Please load a score first.");
        console.error("Verovio PDF Toolkit (tk_pdf) not initialized or MEI data is empty.");
        return;
    }

    try {
        const originalPdfOptions = tk_pdf.getOptions();

        const paperSizeOptions = {
            'LETTER': {
                pdfkitSize: 'LETTER',
                pdfKitMargins: { top: 30, bottom: 30, left: 30, right: 30 },
                svgVerticalOffset: -5,
                footerReservedHeight: 40,
                verovioSettings: {
                    pageWidth: 2056,
                    pageHeight: 2661,
                    spacingLinear: 0.4,
                    spacingNonLinear: 0.59,
                    unit: 9
                }
            },
            'A4': {
                pdfkitSize: 'A4',
                pdfKitMargins: { top: 25, bottom: 30, left: 30, right: 30 },
                svgVerticalOffset: -5,
                footerReservedHeight: 40,
                verovioSettings: {
                    pageWidth: 2100,
                    pageHeight: 2970,
                    spacingLinear: 0.4,
                    spacingNonLinear: 0.59,
                    unit: 9
                }
            },
            'A5': {
                pdfkitSize: 'A5',
                pdfKitMargins: { top: 10, bottom: 10, left: 10, right: 10 },
                svgVerticalOffset: 0,
                footerReservedHeight: 20,
                verovioSettings: {
                    pageWidth: 1100,
                    pageHeight: 2100,
                    spacingLinear: 0.4,
                    spacingNonLinear: 0.5,
                    unit: 6
                }
            },
            'STATEMENT': {
                pdfkitSize: [396, 612],
                pdfKitMargins: { top: 10, bottom: 10, left: 20, right: 20 },
                svgVerticalOffset: 0,
                footerReservedHeight: 40,
                verovioSettings: {
                    pageWidth: 1550,
                    pageHeight: 2056,
                    spacingLinear: 0.5,
                    spacingNonLinear: 0.55,
                    unit: 9
                }
            }
        };

        const currentPaperSettings = paperSizeOptions[selectedPaperSize];

        let doc = new PDFDocument({
            size: currentPaperSettings.pdfkitSize,
            layout: 'portrait',
            margins: currentPaperSettings.pdfKitMargins
        });

        const stream = doc.pipe(blobStream());

        stream.on('finish', function() {
            const blob = stream.toBlob('application/pdf');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // PDF filename using the passed parameters
            const pdfFilename = `${globalTitle || 'untitled'}_${globalTuneTitle || 'untitled'}_${selectedPaperSize.toLowerCase()}.pdf`;
            a.download = pdfFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        });

        stream.on('error', function(err) {
            console.error("Error creating PDF stream:", err);
            // IMPORTANT: Replace alert() with a custom modal or message box.
            alert("An error occurred during PDF creation.");
        });

        const drawableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const drawableHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom - currentPaperSettings.footerReservedHeight;

        const verovioPageHeightForDrawableArea = (drawableHeight / drawableWidth) * currentPaperSettings.verovioSettings.pageWidth;

        tk_pdf.setOptions({
            font: 'Leipzig', // Ensure this font is embedded or available to PDFKit if not standard
            adjustPageHeight: true,
            footer: 'none', // Verovio's footer is disabled as we're adding our own via PDFKit
            pageWidth: currentPaperSettings.verovioSettings.pageWidth,
            pageHeight: verovioPageHeightForDrawableArea,
            unit: currentPaperSettings.verovioSettings.unit,
            scaleToPageSize: false,
            shrinkToFit: false,
            transpose: trInterval, // Assuming trInterval is a global variable or passed as argument
            spacingLinear: currentPaperSettings.verovioSettings.spacingLinear,
            spacingNonLinear: currentPaperSettings.verovioSettings.spacingNonLinear,
        });

        // Reload data into tk_pdf AFTER setting options to apply transpose.
        // Use tk_pdf.getMEI() to reliably get the current MEI data.
        tk_pdf.loadData(tk_pdf.getMEI());

        const pageCount = tk_pdf.getPageCount();

        // Define logo properties BEFORE the loop
        // IMPORTANT: This base64 string is for a specific image. If your logo changes, update this.
        const logoSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAYAAAA4qEECAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGoGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNi4wLWMwMDYgNzkuMTY0NjQ4LCAyMDIxLzAxLzEyLTE1OjUyOjI5ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjIuMiAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDIxLTAyLTE5VDIwOjA1OjQ1WiIgeG1wOk1vZGlmeURhdGU9IjIwMjEtMDMtMDlUMjI6MTk6MDFaIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDIxLTAzLTA5VDIyOjE5OjAxWiIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJzUkdCIElFQzYxOTY2LTIuMSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpkOTIyYzg3MC05MTk3LWMyNDItYjM5My1mMmIwYmFkOGJmODIiIHhtcE1NOkRvY3VtZW50SUQ9ImFkb2JlOmRvY2lkOnBob3Rvc2hvcDpmZGQ4NTU5Yi03NWM5LTA4NDMtYjVjZC00Nzg1ODljYzI1YzEiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo1YzEwOWE5NC02MDgwLTZlNDktOGQ2NC03NjgxZjI4MWZhOWUiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjVjMTA5YTk0LTYwODAtNmU0OS04ZDY0LTc2ODFmMjgxZmE5ZSIgc3RFdnQ6d2hlbj0iMjAyMS0wMi0xOVQyMDowNTo0NVoiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyMi4yIChXaW5kb3dzKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6MThmY2IwOGUtNTMxMi01MzQ1LWFlODEtZThlM2RkNDQ5MTdhIiBzdEV2dDp3aGVuPSIyMDIxLTAyLTE5VDIxOjQzOjA4WiIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIyLjIgKFdpbmRvd3MpIiBzdEV2dDpjaGFuZ2VkPSIvIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpkOTIyYzg3MC05MTk3LWMyNDItYjM5My1mMmIwYmFkOGJmODIiIHN0RXZ0OndoZW49IjIwMjEtMDMtMDlUMjI6MTk6MDFaIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjIuMiAoV2luZG93cykiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPC9yZGY6U2VxPiA8L3htcE1NOkhpc3Rvcnk+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+/R46ogAACk1JREFUeJztnXuQVmUdxz/CJtFAKLAglkBakWIIsoSMOGMKmlRCqQUoIjVaeAmM6AJErUqZNYWM0kSGoUmRSeWUkBlmSFEWG3kb0FBZL0CxRVzbdtn++J539uXdc857nts5y9RnZmffy3ku+3uf9znP77rHtLW18X/CU5P0xuz1l+Q5Dx/UAAOBAcDpwCjgFKAP0B3oArQBLcC/gQPAIWAv8HdgB/Ay8FL0fA/wj+hxa5YJLD7ngdTJHY30BE4DxgBDgROBOqCf53Ha0AewFdgFvAr8ElgP/Muko6NJ0N2AC4EpwIfQCg3NMegbMqDstVnR7x8Ay5Hgq5LHZF15F3A30AT8FJhM55j3ZOBh4D/AMqB32sWdYcJxdAEuA34f/VwFvKHICaVQA1wNXFntos5Eb+DjwKeBXgXPpZxDwG+Bp4BG4HngNeBv0c/+ah10JkF/EEi+bedPM7AGuAd4EJ1WrOlMW8fjwAJgc9ETAb4PvAWYBKzGUchQrKC7AouA3wF3AMdGz4ejY9pDBczpMaAWmIqOct4oStCnIsVgHnAWcB3a+54BZqITxnuBwegMmwezgXORguKdIgT9fiTQN8W8dyqwFH1Vl6EPYwjtZ9cQHERa5O0Bx8hd0HPQjSULVyPN7HZgCXASsM/zfHaiD/KPnvvtQJ6CXgJ8zaLdJ9Dxqj9SvZ/1NJ89SIVv9NRfKnkJ+kfADQ7tu6FVtxQYC/zFw5wuBF7w0E8m8hD0DwFfpsCZwP3Ao479fARpnLkRWmFZilRpn5yHVnUrOiKasgzZTnIlpKDnohUYgmMt2/0T+KzHeWQm1NYxDrgtUN8uzEPG/NwJIega4K4A/bryIvDNogYPIehvA4MC9OvK4iIH9y3oC5DtuLPRik4/heFb0K8Aj5DBPpsz65D9uDB8C/ppYDzQA+gLfBLY6HkMG54segK+BH0ysAopE3ORcWg38A2k5h4P1CNvRBEUuprBj6BrgT8gz/Sl6Fj3DDIINQA3RY+/iOzMI5BLKE9eyXm8DvgQ9J0oSCWO4cDnkaKwGXmO/wy8ExiJjlx5cDincRJxFfRwsqvYw5CLqA2t+k3IXZTqPfbEm3MYIxVXQc+3bDcXCfyrwL0oUGWT41zSGFD9krC4CHow7la5T6EAlIloK7GxV2eh8BXtYlSaiFaijzn8BN04xyOf3a0e+i1npOf+jHFZ0dd6m4UYgU4HQ5CLySdvRZGmhWEr6LHA231OJKIbMAO5rXwzLECfmbEV9ASvs8iHSUUObivoiV5nkQ9nFTm4zc3wIhQEbso+pB22IlvIKOBig/b70ZGwh8XYoID1Mygo5MxG0NMsx+qBrGgNZa8NAdaio2I1nor6GGo5PujeUoigTbeO01DEvS2bgFvKnm9BX+ndGdo24O7jtF0kzpgK2iU2o8R8ZPtYhGwkO6PHaTQjC1yt49ijkZ0ld0wFfYGncXshR2kjsldfV+X6fegDsfV+l3O5hz6MMRX0chSStR0/FrHuaJWdUuW6Xcj0+joPY16GH43WCFNBL0L79CCkbV0OfAtFZIakO4os9WHAP5kC/JouKvgLwEqUc3Ic8G7kAfcd8Qn6YJuAH3vqL1RgTyImgu6KVOQ4moFfA9egiM8r8Rwxj9xhqzz1NYqcTyAmgp6Gwmd/gWLXbgTOJF6BuBcFmk8EnnOcY4mLUWDiXz31FzK4vQMmgn5H9LsUu/F14E/oqLYKreLK49eDyPh0A9LqXCidFr7k2E+JkSgTLBdMBJ0UfdQVOWZXoNPBb1D+STl3oCPdWtMJljEGKTfLUVKPD3ILeDQRdFYbwznAz5ABv572Vb4X2UmuIGO1gBg+F/2+xrJ9JaOA6Z76SsVE0McZ9t0HWIhW+W20pxjfh/bvbYb9gfbps1Gm1gyL9nFc76mfVEwE7XLIn4tW9M3R851ISbGJh5sX/f4ufjKp6sjhBBJi60gbawFSOsZFr30Yc2FNQGd2UG6gjxSJ4NuHiaCP9zTmCajGxcro+WzMg9bL9+j34O5jPB+ZbINhIuhmz2NPQdvJeOAzaLVnZTIyAYCOl5M8zCeotmgi6BCpuz1QcZEFyI6y2KDt1LLHG5EC5cK46pfYYyLoEDaMEjcjgd+IwsayMKni+WLg5w5zGErA+A8TQdcjTTAU49HenTWZZwQdXWALHedwtmP7REwE/Tg6Cr0Nf1a0SsZhFphT6Y3fhFuiUjCV3ETQXdBZ+nk0of5ItS6SsTGvrYx5LStDgdc7tE/ERNCHOdIwtAsZi/qgbcWoDpwn4sK8HsU+kb4v+sZ6x9TwX0PHIn5NKF6jFxJ8ngIfRLx7y8WUOtyhbSKmgm5BHpWlCe+XrHTTsbNlmNKf+JBcl6o1QWKpbVxZT6DD/Q6SveL3IFvGFWiLyZsXHdr6LrsJ2Al6LVqt/ZG35Ulkbozjvui661Hh1bxw0WKDBK3bCLqNI3OqT0dZWRtpN/ZUcifSAutRhL8vmoi3c9iUlyjRaQQNWqmVteBGo9i6zcjQU0kLumnW4q/U2nOoPHEl3R36LPx4V85rKHkzjmGoAuKrKMewshrYHuTqmoCcvS4kaaqFBp3H4RLXUa0kwwCUY7gd5ahMQefUEmuQF92FpEoyJzj0GeR46hKduR7dGOO2iXK6IFW5pC43oKTOpmj8g9h91X9Fchk1l3yVpx3aJuIaBjsLhd6aMCL6ceULCa/X4XZD8xWHcgSuCZ1b8RdnYcJNwIaE90Y79h2k2KCPXPD5yNCUF3eTvJrBLYDxZVSU1ju+ykjUV3m/DoUbrHYc5zFUsy5tnDqH/lfjHlEViy9Bf490n99H0U3vEuxtvk+garhpuAbWrHBsn4jPCjSLkI0jjpno2LQQxSebsoXqQh6GCsfa8ggBE/99FxicjsyWcQlFPam+xcSxDRn44zTAcuZVeb8aQW/qIcqxTcUtmLGc7UipqeaBn4aCcWxZhXu901RCVXK8CJUxTqIFqeJpbEVpHNWuG4iMVrbsJodY6ZDVdmehmOrKKmH70JEwLfT2WZTlmqWs20NoW7JlJv6rKXQgdFnjLSiueSAyoZ6IyvucRHJ68gYk5CwGp3W4ZdLOIdk45pW8/g9LY/TTD/1h5yZcdz8Kas/CwyTbv7NwC8payIW8BD0GaXRpgYS30h5onsYbUVbBGQ7zuZSc/7lOHoL+Duna3F4U3rUuQ1/no7wY2/+b1YCsjbn7MUPt0YNQhGgj6ULegPbsLEK+CikVNkI+iBzFZ1KMs9j7iu6LMmmzqNlzyL5H9sbuCHcA+AoqN7/Dor03fAm6FkWEfizDtduQE8CkbOYBZFnLWsfpJWR/WUJBK7gSV0H3Q/8Sb1bGvu7Czh5xCJV/mIK0wDEcuYUcRgVmNyIBP0AgK5wttoIeAnwZ+EDG6/cD70NpzLY0I+vaCjTvwShmpBV/CfnBMBF0V2RPuBazOOI1Ubu9Bm2q0YKcDXk6HJzIIug+yASaZf+tZAZKU/ufJ03QNWg/XEJ76tsBtJrScg57oq/yeeQT6HhU8F93oOHIC4bJmAAAAABJRU5ErkJggg==';
    const logoHeight = 25; // Desired height of the logo in points (1 point = 1/72 inch)
        // Based on 100x25px image, aspect ratio 4:1. If height is 25, width will be 100.
        const logoWidth = logoHeight * (100 / 25); // Calculate width based on aspect ratio
        const gapBetweenLogoAndText = -75; // As per your request

        // Calculate the base Y position for the bottom-most line (logo and copyright)
        // This will be the bottom margin minus a small offset, or aligned with footerCenterY
        const baseFooterY = doc.page.height - doc.page.margins.bottom - (currentPaperSettings.footerReservedHeight / 2);

        for (let i = 1; i <= pageCount; i++) {
            const svgString = tk_pdf.renderToSVG(i);

            if (typeof svgString !== 'string' || svgString.trim() === '' || !svgString.startsWith('<svg')) {
                console.error(`SVG string for page ${i} from PDF toolkit is invalid or empty:`, svgString);
                throw new Error(`Invalid or malformed SVG content for page ${i}.`);
            }

            await SVGtoPDF(doc, svgString, doc.page.margins.left, doc.page.margins.top + currentPaperSettings.svgVerticalOffset, {
                width: drawableWidth,
                height: drawableHeight,
                preserveAspectRatio: 'xMidYMid meet',
                assumeGIsCursive: true
            });

            // --- Footer Content ---
            doc.font('Helvetica'); // Set font for all footer text
            doc.fontSize(9); // Smaller font size for source lines

            // Position Text Source line (e.g., 20 points above the baseFooterY)
            const textSourceLineY = baseFooterY - 33; // Adjust this value as needed
            doc.text(`Text source: ${globalTextSource} (${globalTextSourceDate})`, doc.page.margins.left, textSourceLineY, {
                align: 'center'
            });

            // Position Tune Source line (e.g., 10 points above the baseFooterY)
            const tuneSourceLineY = baseFooterY - 23; // Adjust this value as needed
            doc.text(`Tune source: ${globalTuneSource} (${globalTuneSourceDate})`, doc.page.margins.left, tuneSourceLineY, {
                align: 'center'
            });

            // Current copyright text and logo
            const copyrightText = "Generated by the Digital Splitleaf (https://splitleaf.org)";
            doc.fontSize(10); // Revert to original font size for copyright text

            // Calculate copyright text width
            const copyrightTextWidth = doc.widthOfString(copyrightText);

            // Calculate the total width of the combined logo and copyright text block
            const totalCopyrightContentWidth = logoWidth + gapBetweenLogoAndText + copyrightTextWidth;

            // Calculate the starting X position for the combined block to be centered
            // This will center the logo and copyright text within the drawable width
            const startXForCopyrightBlock = doc.page.margins.left + (drawableWidth - totalCopyrightContentWidth) / 2;

            // Position the logo
            const logoX = startXForCopyrightBlock;
            const logoY = baseFooterY - (logoHeight / 2); // Vertically center logo within its line area

            try {
                doc.image(logoSrc, logoX, logoY, {
                    height: logoHeight // Set height, width will auto-scale based on image aspect ratio
                });
            } catch (imgError) {
                console.error("Error adding logo image to PDF:", imgError);
                // Fallback if logo fails to load/render
                // You might want to display a fallback text or just skip the image
            }

            // Position the copyright text next to the logo
            const copyrightTextX = logoX + logoWidth + gapBetweenLogoAndText;
            const copyrightTextY = baseFooterY - (doc.currentLineHeight() / 2); // Vertically center text relative to its font size

            doc.text(copyrightText, copyrightTextX, copyrightTextY, {
                width: copyrightTextWidth // Constrain text width to its actual size
            });
            // --- End Footer Content ---

            if (i < pageCount) {
                doc.addPage();
            }
        }

        doc.end();
        tk_pdf.setOptions(originalPdfOptions);

    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Failed to generate PDF: " + error.message);
    }
}

// --- Utility: recursively change attribute (unchanged) ---
function changeAttributeRecursively(node, attributeName, sequence) {
    for (let i = 0; i < node.childNodes.length; i++) {
        const childNode = node.childNodes[i];
        if (childNode.nodeType === Node.ELEMENT_NODE) {
            let oldID = childNode.getAttribute(attributeName);
            if (oldID === null) {
                oldID = childNode.nodeName + '_' + Date.now();
            }
            let newValue = oldID + sequence;
            childNode.setAttribute(attributeName, newValue);
            let childClass = node.getAttribute("class");
            if (childClass !== "undefined") {
                childNode.setAttribute("class", newValue)
            }
            changeAttributeRecursively(childNode, attributeName, newValue);
        }
    }
}

function findParentNode(xmlDoc, childNode, parentTagName) {
    let currentNode = childNode;
    while (currentNode && currentNode.tagName !== parentTagName) {
        currentNode = currentNode.parentNode;
    }
    return currentNode;
}

function displayMode (xmlDoc, stanzaCount){
    var dupNode = xmlDoc.getElementsByTagName("section")[0];
    var bars = dupNode.getElementsByTagName("measure");

    //Set final bar to double barline
    var barsCount = bars.length;
    bars[barsCount-1].setAttribute("right", "dbl");

    //Identify the measures in the section to be duplicated
    var m = dupNode.getElementsByTagName("measure");

    //Get rid of extra text in MEI section before copying
    var mDir = m[0].getElementsByTagName("dir");
    var mTempo = m[0].getElementsByTagName("tempo");
            
    if (mDir !== "undefined"){
        for (var i=0; i<mDir.length; i++){
        mDir[i].remove();
        } 
    }
    
    if (mTempo !== "undefined"){
        for (var i=0; i<mDir.length; i++){
        mTempo[i].remove();
        } 
    }

    var versesToDelete = Array.from(xmlDoc.querySelectorAll('verse:not([n="1"])'));
        versesToDelete.forEach(verse => {
            // Remove the verse element from its parent node
            verse.parentNode.removeChild(verse);
        });

    for (i=1; i<stanzaCount; i++){
        //Create new version of content to be copied
        var newNode = dupNode.cloneNode(true);

        //Create new section in the MEI document
        var newSection = xmlDoc.createElement("section");
        var parentElement = xmlDoc.getElementsByTagName("score")[0];
        var getAtt = "xml:id";
        var newSectionAtt = xmlDoc.createAttribute(getAtt);
        var oldAtt = newNode.getAttribute(getAtt);

        //Delete verses not needed from the new version
        var versesToDelete = Array.from(newNode.querySelectorAll('verse:not([n="'+(i+1)+'"])'));
        versesToDelete.forEach(verse => {
            // Remove the verse element from its parent node
            verse.parentNode.removeChild(verse);
        });

        //Create a new xml:id attribute for the new section
        if (oldAtt === 'undefined') {
            oldAtt = newNode.nodeName + '_' + Date.now();
        }

        var newAttValue = oldAtt + "A";
        parentElement.appendChild(newSection);
        newSectionAtt.nodeValue = newAttValue;
        parentElement.lastChild.setAttributeNode(newSectionAtt);
        newNode.setAttribute(getAtt, newAttValue);
        
        changeAttributeRecursively(newNode, getAtt, );	


        for (let i = 0; i < newNode.childNodes.length; i++) {
                const childNode = newNode.childNodes[i];
                newNode.appendChild(childNode.cloneNode(true)); 
        }
        
        const targetRoot = xmlDoc.getElementsByTagName("score")[0].lastChild;
        targetRoot.appendChild(newNode);             
    }
    
    var finalBars = xmlDoc.getElementsByTagName("measure");
    var finalBarCount = finalBars.length;
    bars[finalBarCount-1].setAttribute("right", "end");
}


//Combine the correct portions of the relevant XML files
function renderPsalm(options = {}) {
    var goButton = document.getElementById("menutoggle");
    goButton.className = "test";
    
    let isAutoGen = options.autoGen === true;

    // --- Get values from options OR DOM ---
    let selStanzas;
    if (isAutoGen && options.selStanzas && Array.isArray(options.selStanzas)) {
        selStanzas = options.selStanzas;
    } else {
        var selBoxes = document.getElementsByName("stanzas");
        selStanzas = [];
        for (var c = 0; c < selBoxes.length; c++) {
            if (selBoxes[c].checked) selStanzas.push(selBoxes[c].value);
        }
    }
    // Only set global if selStanzas is non-empty and form is ready
    if (selStanzas && selStanzas.length > 0) globalSelStanzas = selStanzas;

    let teiID;
    if (isAutoGen && options.teiID) {
        teiID = options.teiID;
    } else {
        var psInput = document.getElementById("pstext");
        if (!psInput || !psInput.dataset.psdata) {
            console.error("Psalm text selection is missing or incomplete.");
            return;
        }
        var psDataArr = psInput.dataset.psdata.split(';');
        teiID = psDataArr[0];
    }
    if (teiID) globalTeiID = teiID;

    let psTune;
    if (isAutoGen && options.psTune) {
        psTune = options.psTune;
    } else {
        var tuneInput = document.getElementById("pstune");
        if (!tuneInput || !tuneInput.dataset.tuneid) {
            console.error("Tune selection is missing or incomplete.");
            return;
        }
        psTune = tuneInput.dataset.tuneid;
    }
    if (psTune) globalPsTune = psTune;

    // --- Use these variables below ---
    var psText = "getVerses.xq?teiID=" + teiID + "&selStanzas=\"1\," + selStanzas + ",6\"";

    if (document.getElementById("psMode") !== null){
        var disOptions = document.getElementById("psMode").checked;
    }

    // --- Use these variables below ---
    var psText = "getVerses.xq?teiID=" + teiID + "&selStanzas=\"1\," + selStanzas + ",6\"";

    if (document.getElementById("psMode") !== null){
        var disOptions = document.getElementById("psMode").checked;
    }

    var xmlhttp = new XMLHttpRequest();
  
  xmlhttp.open("GET", psText, true);
  xmlhttp.send(); 
  
  xmlhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
      var myObj = this.responseXML;
      var title = myObj.getElementsByTagName("title")[0].childNodes[0].nodeValue;
      globalTitle = title;
      var author = myObj.getElementsByTagName("author")[0].childNodes[0].nodeValue;
      var textStanzas = myObj.getElementsByTagName("lg").length;
      var textSyll = myObj.getElementsByTagName("lg")[0].getElementsByTagName("seg").length;
      var textLicense = myObj.getElementsByTagName("license")[0].childNodes[0].nodeValue;
      var textLicenseURL = myObj.getElementsByTagName("license")[0].getAttribute("target");
      var textSource = myObj.getElementsByTagName("edition")[0].getElementsByTagName("title")[0].innerHTML;
      globalTextSource = textSource;
      var textSourceDate = myObj.getElementsByTagName("edition")[0].getElementsByTagName("date")[0].innerHTML;
      globalTextSourceDate = textSourceDate;
  
      //Get MEI file
      var xhttp = new XMLHttpRequest();
  
      xhttp.open("GET", psTune, true);
      xhttp.send();
  
      xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
          var xmlDoc = this.responseXML;
          var project = xmlDoc.getElementsByTagName("mei")[0];
          var i, j, k, r = "";
          var wordPos = [];
          var tuneMetre = xmlDoc.getElementsByTagName("otherChar")[0].childNodes[0].nodeValue;
          var tuneLicense = xmlDoc.getElementsByTagName("useRestrict")[0].childNodes[0].nodeValue;
          var tuneLicenseURL = xmlDoc.getElementsByTagName("useRestrict")[0].getAttribute("auth.uri");
          var tuneSource = xmlDoc.getElementsByTagName("edition")[0].getElementsByTagName("title")[0].innerHTML;
          globalTuneSource = tuneSource;
          var tuneSourceDate = xmlDoc.getElementsByTagName("edition")[0].getElementsByTagName("date")[0].innerHTML;
          globalTuneSourceDate = tuneSourceDate;
          var metreLen = tuneMetre.length;
          var multiMetre = tuneMetre.charAt(metreLen-2);
          var partMetreCheck = tuneMetre.charAt(metreLen-1);
  
          if (multiMetre === "D"){
            var metreMult = 2;
          } else if (multiMetre === "T"){
            var metreMult = 3;
          } else if (multiMetre === "Q"){
            var metreMult = 4;
          } else {
            var metreMult = 1;
          }
          
          //Get notes with verse containers
          var y = project.getElementsByTagName("verse");
          var sylCount = y.length;

          //Get noteIDs for notes with verse containers
          var containerPos = [];
          for (i = 0; i < sylCount; i++){
            containerPos[i] = y[i].parentElement.getAttribute("class");
          }
          
          if (partMetreCheck === ")"){
              var startPartMetre = tuneMetre.indexOf("(");
              var partMetre = tuneMetre.substring(startPartMetre+1, metreLen-1);
              var partMetreResult = "true";
              var partMetre = partMetre.slice(0, -1);
              var repeatArray = partMetre.split('.');
              var repeatSum = repeatArray.reduce((partialSum, a) => partialSum + Number(a), 0);
              var sylCount = sylCount - repeatSum;
              var startRepeat = sylCount - repeatSum;
    
          } else {
              var partMetreResult = "false"
          }
  
          //Check number of stanzas
          var stanzaCount = textStanzas/metreMult;
          var halfStanza = Number.isInteger(stanzaCount);
          var fullStanza = Math.floor(stanzaCount);
          
          //Fill document metadata
          var xmlTitleStmt = project.getElementsByTagName("titleStmt");
          var xmlTitle = xmlTitleStmt[0].getElementsByTagName("title");
          var newTitle = xmlDoc.createTextNode(title);
          var titlePos = xmlTitle[0];
  
          
          if (typeof titlePos.childNodes[0] !== 'undefined') {
            titlePos.childNodes[0].nodeValue = title;
          } else {
            titlePos.appendChild(newTitle);
          }
         
          var work = project.getElementsByTagName("work");
          var tuneTitle = work[0].getElementsByTagName("title")[0].childNodes[0].nodeValue;
          globalTuneTitle = tuneTitle;
          var subTitle = xmlDoc.createElement("title", project.namespaceURI);
          var newTune = xmlDoc.createTextNode("Tune: " + tuneTitle);
          titlePos.parentElement.appendChild(subTitle).appendChild(newTune);
          titlePos.parentElement.lastElementChild.setAttribute("type","subordinate");
  
          var xmlAuth = project.getElementsByTagName("persName");
          var authPos = xmlAuth[0].parentElement;
          var newPers = xmlDoc.createElement("persName", project.namespaceURI);
          var authUpdate = "Text by " + author
          var newAuth = xmlDoc.createTextNode(authUpdate);
          var lyrDefined = xmlDoc.querySelectorAll("[role='lyricist']");
  
          if (lyrDefined === undefined || lyrDefined.length == 0){
            authPos.appendChild(newPers).appendChild(newAuth);
            authPos.lastElementChild.setAttribute("role","lyricist");
          } else {
            lyrDefined[0].childNodes[0].nodeValue = authUpdate;
          }
  
          //Loop through each syllable container in XML
          for (i = 0; i< sylCount; i++){

              //Ready first stanza to fill existing syllable containers 
              var thisContainer = project.getElementsByClassName(containerPos[i])
              var newLyric = myObj.getElementsByTagName("seg");
              var newLyr = newLyric[i].childNodes[0].nodeValue;
              var newLyrLen = newLyr.length;
              var lastChar = newLyr.charAt(newLyrLen-1);
              var newText = xmlDoc.createTextNode(newLyr);
              var trimLyr = newLyr.substr(0,newLyrLen-1);
              var trimText = xmlDoc.createTextNode(trimLyr); 
    
              if (partMetreResult == "true" && i > startRepeat - 1) {
                
                var r = i + repeatSum;
                var repeatContainer = project.getElementsByClassName(containerPos[r])
                var repeatLyr = newLyric[r].childNodes[0].nodeValue;

                if (lastChar == "-"){

                  //Add new lyr element with trimmed lyric text
                  thisContainer[0].lastElementChild.lastElementChild.textContent = trimText.textContent;
                  repeatContainer[0].lastElementChild.lastElementChild.textContent = trimText.textContent;
    
                  //Add appropriate connector attribute for new lyr element
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");
                  repeatContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");            
    
                     //Test if the syllable is in an initial or middle position
                     if (wordPos == "i" || wordPos == "m"){
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                        repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                     } else {            
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                        repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                     }
                  }  else {
                  thisContainer[0].lastElementChild.lastElementChild.textContent = newText.textContent
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t");
    
                  repeatContainer[0].lastElementChild.lastElementChild.textContent = newText.textContent
                  repeatContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                  repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t");
                  }
                  
           } else {
            if (lastChar == "-"){
                  //Add new lyr element with trimmed lyric text
                  thisContainer[0].lastElementChild.lastElementChild.textContent = trimText.textContent;
    
                  //Add appropriate connector attribute for new lyr element
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");          
    
                     //Test if the syllable is in an initial or middle position
                     if (wordPos == "i" || wordPos == "m"){
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                     } else {            
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                     }
                  }  else {
                  thisContainer[0].lastElementChild.lastElementChild.textContent = newText.textContent;
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t")
                  }
           }
           //Add xml:id for new <lyr>
                  var newLyrAtt = 'syl_' + Date.now();
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("xml:id", newLyrAtt + "A");
           
           //Update the WordPos with the latest WordPos for the next word
              wordPos = thisContainer[0].lastElementChild.lastElementChild.getAttribute("wordpos");
        } 
          
          var k = i;
  
          // If there is more than one stanza  
          j = 1;
          
          if (fullStanza > 1){
  
            //Loop through each stanza for each note
            for (j = 1; j < fullStanza; j++){
                
                //Loop through each syllable container
        for (i = 0; i< sylCount; i++){

          //Ready first stanza to fill existing syllable containers 
          var thisContainer = project.getElementsByClassName(containerPos[i])
          var newVerse = xmlDoc.createElement("verse", project.namespaceURI);
          var repeatVerse = newVerse.cloneNode(true);
          var newSyl = xmlDoc.createElement("syl", project.namespaceURI);
          var repeatSyl = newSyl.cloneNode(true);
          var newLyr = newLyric[k].childNodes[0].nodeValue;
          var newLyrLen = newLyr.length;
          var lastChar = newLyr.charAt(newLyrLen-1);
          var newText = xmlDoc.createTextNode(newLyr);
          var trimLyr = newLyr.substr(0,newLyrLen-1);
          var trimText = xmlDoc.createTextNode(trimLyr); 

        //Create new verse element with n attribute
          thisContainer[0].appendChild(newVerse).setAttribute("n",j+1);

          if (partMetreResult == "true" && i > startRepeat - 1) {
            var r = i + repeatSum;
            var repeatContainer = project.getElementsByClassName(containerPos[r])
            var repeatLyr = newLyric[r].childNodes[0].nodeValue;
          
            //Create new verse element with n attribute
            repeatContainer[0].appendChild(repeatVerse).setAttribute("n",j+1);

            if (lastChar == "-"){

              //Add new lyr element with trimmed lyric text
                  thisContainer[0].lastElementChild.appendChild(newSyl).textContent = trimText.textContent;
                  repeatContainer[0].lastElementChild.appendChild(repeatSyl).textContent = trimText.textContent;

                  //Add appropriate connector attribute for new lyr element
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");
                  repeatContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");            

                     //Test if the syllable is in an initial or middle position
                     if (wordPos == "i" || wordPos == "m"){
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m")
                        repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                     } else {            
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                        repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                     }
              }  else {
                  thisContainer[0].lastElementChild.appendChild(newSyl).textContent = newText.textContent
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t")

                  repeatContainer[0].lastElementChild.appendChild(repeatSyl).textContent = newText.textContent
                  repeatContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                  repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t");
              }
       } else {
        if (lastChar == "-"){
                  //Add new lyr element with trimmed lyric text
                  thisContainer[0].lastElementChild.appendChild(newSyl).textContent = trimText.textContent;

                  //Add appropriate connector attribute for new lyr element
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");          

                     //Test if the syllable is in an initial or middle position
                     if (wordPos == "i" || wordPos == "m"){
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                     } else {            
                        thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                     }
              }  else {
                  thisContainer[0].lastElementChild.appendChild(newSyl).textContent = newText.textContent;
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                  thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t")
              }
       }
        //Add @xml:id for new <lyr>
        var newLyrAtt = 'syl_' + Date.now();
        thisContainer[0].lastElementChild.lastElementChild.setAttribute("xml:id", newLyrAtt);

    //Update the WordPos with the latest WordPos for the next word
          wordPos = thisContainer[0].lastElementChild.lastElementChild.getAttribute("wordpos");
    
        //Update the syllable counter
        k = k + 1;
                }
                                    
            }
        } 
  
            
            //Is there a half stanza at the end?
            if (halfStanza === false){
  
                var remainder = textStanzas % metreMult;
  
                //Set the starting container for the final half stanza
                startCount = textSyll* (metreMult - remainder);
  
                j = j + 1;
  
                for (i = startCount; i< sylCount; i++){

                  //Ready half stanza to fill final syllable containers 
                  var thisContainer = project.getElementsByClassName(containerPos[i])
                  var newVerse = xmlDoc.createElement("verse", project.namespaceURI);
                  var repeatVerse = newVerse.cloneNode(true);
                  var newSyl = xmlDoc.createElement("syl", project.namespaceURI);
                  var repeatSyl = newSyl.cloneNode(true);
                  var newLyr = newLyric[k].childNodes[0].nodeValue;
                  var newLyrLen = newLyr.length;
                  var lastChar = newLyr.charAt(newLyrLen-1);
                  var newText = xmlDoc.createTextNode(newLyr);
                  var trimLyr = newLyr.substr(0,newLyrLen-1);
                  var trimText = xmlDoc.createTextNode(trimLyr); 
        
                  //Create new verse element with n attribute
                  thisContainer[0].appendChild(newVerse).setAttribute("n",j);
        
                  if (partMetreResult == "true" && i > startRepeat-1) {
                    var r = i + repeatSum;
                    var repeatContainer = project.getElementsByClassName(containerPos[r])
                    var repeatLyr = newLyric[r].childNodes[0].nodeValue;
                    //Create new verse element with n attribute
                        repeatContainer[0].appendChild(repeatVerse).setAttribute("n",j);
        
                  if (lastChar == "-"){
                      //Add new lyr element with trimmed lyric text
                      thisContainer[0].lastElementChild.appendChild(newSyl).textContent = trimText.textContent;
                      repeatContainer[0].lastElementChild.appendChild(repeatSyl).textContent = trimText.textContent;
        
                      //Add appropriate connector attribute for new lyr element
                      thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");
                      repeatContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");            
        
                         //Test if the syllable is in an initial or middle position
                         if (wordPos == "i" || wordPos == "m"){
                            thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                            repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                         } else {            
                            thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                            repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                         }
                      }  else {
                      thisContainer[0].lastElementChild.appendChild(newSyl).textContent = newText.textContent;
                      thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                      thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t")
        
                      repeatContainer[0].lastElementChild.appendChild(newSyl).textContent = newText.textContent;
                      repeatContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                      repeatContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t")
                      }
               } else {
                if (lastChar == "-"){
                      //Add new lyr element with trimmed lyric text
                      thisContainer[0].lastElementChild.appendChild(newSyl).textContent = trimText.textContent;
        
                      //Add appropriate connector attribute for new lyr element
                      thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","d");          
        
                         //Test if the syllable is in an initial or middle position
                         if (wordPos == "i" || wordPos == "m"){
                            thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","m");
                         } else {            
                            thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","i");
                         }
                      }  else {
                      thisContainer[0].lastElementChild.appendChild(newSyl).textContent = newText.textContent;
                      thisContainer[0].lastElementChild.lastElementChild.setAttribute("con","s")
                      thisContainer[0].lastElementChild.lastElementChild.setAttribute("wordpos","t")
                      }
               }
               //Add @xml:id for new <lyr>
        var newLyrAtt = 'syl_' + Date.now();
        thisContainer[0].lastElementChild.lastElementChild.setAttribute("xml:id", newLyrAtt);
               
               //Update the WordPos with the latest WordPos for the next word
                  wordPos = thisContainer[0].lastElementChild.lastElementChild.getAttribute("wordpos");
                
                //Update the syllable counter
                          k = k + 1;
                }            
            }            
          if (disOptions == true) {

    //Set final bar to double barline
    var bars = xmlDoc.getElementsByTagName("measure");
    var barsCount = bars.length;
    bars[barsCount-1].setAttribute("right", "dbl");
    var dupNode = xmlDoc.getElementsByTagName("section")[0].cloneNode(true);

    //Set n value to current <section>
    var newSectionN = xmlDoc.getElementsByTagName("section")[0];
    var getAttN = "n";
    var newSectionAttN = xmlDoc.createAttribute(getAttN);
    newSectionAttN.nodeValue = 1;
    newSectionN.setAttributeNode(newSectionAttN);

    //Identify the measures in the section to be duplicated
    var m = dupNode.getElementsByTagName("measure");

    //Get rid of extra text in MEI section before copying
    var mDir = m[0].getElementsByTagName("dir");
    var mTempo = m[0].getElementsByTagName("tempo");
            
    if (mDir !== "undefined"){
        for (var i=0; i<mDir.length; i++){
        mDir[i].remove();
        } 
    }
    
    if (mTempo !== "undefined"){
        for (var i=0; i<mTempo.length; i++){
        mTempo[i].remove();
        } 
    }

    var versesToDelete = Array.from(xmlDoc.querySelectorAll('verse:not([n="1"])'));
        versesToDelete.forEach(verse => {
            // Remove the verse element from its parent node
            verse.remove();
        });

    for (i=1; i<stanzaCount; i++){
        //Create new version of content to be copied
        var newNode = dupNode.cloneNode(true);
		var parentElement = project.getElementsByTagName("score")[0];
        var getAtt = "xml:id";
        var getAttN = "n";
        var newSectionAtt = xmlDoc.createAttribute(getAtt);
        var newSectionAttN = xmlDoc.createAttribute(getAttN);
        var oldAtt = newNode.getAttribute(getAtt);

        //Create a new xml:id attribute for the new section
        if (oldAtt === null) {
            oldAtt = newNode.nodeName + '_' + Date.now();
        }

        var aSequence = "A".repeat(i);
        var newAttValue = oldAtt + aSequence;
        newSectionAtt.nodeValue = newAttValue;
        newSectionAttN.nodeValue = i+1;
        newNode.setAttributeNode(newSectionAtt);
        newNode.setAttributeNode(newSectionAttN);

         //Delete verses not needed from the new version
        var versesToDelete = Array.from(newNode.querySelectorAll('verse:not([n="'+(i+1)+'"])'));
        versesToDelete.forEach(verse => {
            // Remove the verse element from its parent node
            verse.remove();
        });
        
        //Update remaining verse to @n=1
        var keptVerses = newNode.querySelectorAll('verse');
        keptVerses.forEach(verse => {
            const originalN = verse.getAttribute('n');
            verse.setAttribute('n', '1');
        });
        
        var sequence = "A".repeat(i);
        changeAttributeRecursively(newNode, getAtt, sequence);	
        
        var targetRoot = xmlDoc.getElementsByTagName("score")[0];
        targetRoot.appendChild(newNode);

    }
    
	//Delete the unused music in the half stanza
    var sections = xmlDoc.getElementsByTagName('section');
    var lastSection = sections[sections.length - 1];
    var measuresInLastSection = lastSection.getElementsByTagName('measure');
    for (let i = measuresInLastSection.length - 1; i >= 0; i--) {
        var measure = measuresInLastSection[i];
        
        // Check if <measure> contains any <lyr> element at any depth
        // getElementsByTagName searches all descendants
        var hasLyr = measure.getElementsByTagName('syl').length > 0;

        if (hasLyr == false) {
            // If no <syl> is found, delete the <measure> element
            measure.parentNode.removeChild(measure);         
        }
    }
    
    var allSections = xmlDoc.getElementsByTagName('section');
var lastSection = allSections[allSections.length - 1];
var measuresInLastSection = lastSection.getElementsByTagName('measure');
for (let i = measuresInLastSection.length - 1; i >= 0; i--) {
        var measure = measuresInLastSection[i];
        
        // Check if <measure> contains any <lyr> element at any depth
        // getElementsByTagName searches all descendants
        var hasLyr = measure.getElementsByTagName('syl').length > 0;

        if (hasLyr == false) {
            // If no <syl> is found, delete the <measure> element
            measure.parentNode.removeChild(measure);         
        }
    }

//Remove unused portion of the first measure
var partFirstMeasure = lastSection.getElementsByTagName("measure")[0];
var partFirstLayer = partFirstMeasure.getElementsByTagName("layer")[0];
var notesInFirstLayer = partFirstLayer.getElementsByTagName("note");
var partMeasureDur = 0;
var partContainers = [];

//Remove notes in first layer without lyrics while creating a timestamp for other layers
for (let i = 0; i < notesInFirstLayer.length; i++){
    var thisNoteCandidate = notesInFirstLayer[i];
    var hasLyr = thisNoteCandidate.getElementsByTagName('syl').length > 0;
    if (hasLyr == false) {
        var thisCandidateDur = 1/Number(thisNoteCandidate.getAttribute("dur"));
        var thisCandidateDots = thisNoteCandidate.getAttribute("dots");
        var addNoteDur = thisCandidateDur;

        if (thisCandidateDots !== null){
            for (o=0; o < thisCandidateDots; o++){
                addNoteDur = addNoteDur/2;
                thisCandidateDur = thisCandidateDur + addNoteDur;
            }
        }
        partMeasureDur = partMeasureDur + thisCandidateDur;
        thisNoteCandidate.parentNode.removeChild(thisNoteCandidate);
    } else {
        break;
    }   
}

//Use the timestamp to delete the unused notes in the other layers
var allLayers = partFirstMeasure.getElementsByTagName("layer");
for (let i = 1; i < allLayers.length; i++){
    var notesInLayer = allLayers[i].getElementsByTagName("note");
    var thisLayerDur = 0;
    var j = 0;
    while (thisLayerDur < partMeasureDur) {
        var thisCandiadateNote = notesInLayer[j];
        var thisCandidateDur = 1/Number(thisCandiadateNote.getAttribute("dur"));
        var thisCandidateDots = thisCandiadateNote.getAttribute("dots");
        var addNoteDur = thisCandidateDur;

        if (thisCandidateDots !== null){
            for (o=0; o < thisCandidateDots; o++){
                addNoteDur = addNoteDur/2;
                thisCandidateDur = thisCandidateDur + addNoteDur;
            }
        }
        thisLayerDur = thisLayerDur + thisCandidateDur;
        j = j+1;
        thisCandiadateNote.parentNode.removeChild(thisCandiadateNote);
    }
}
    
    var finalBars = xmlDoc.getElementsByTagName("measure");
    var finalBarCount = finalBars.length;
    bars[finalBarCount-1].setAttribute("right", "end");
	};

          
          document.getElementById("controls").style.display = "inline";
          var textLicenseHTML = "<p><strong>Text Source:</strong>&nbsp;<em>" + textSource + "</em>&nbsp;(" + textSourceDate + ")<br/> <a href='" + textLicenseURL + "' target='_blank'>" + textLicense + "</a></p>"
          var tuneLicenseHTML = "<p><strong>Tune Source:</strong>&nbsp;<em>" + tuneSource + "</em>&nbsp;(" + tuneSourceDate + ")<br/> <a href='" + tuneLicenseURL + "' target='_blank'>" + tuneLicense + "</a></p>"
          document.getElementById("textLicense").innerHTML = textLicenseHTML;
          document.getElementById("tuneLicense").innerHTML = tuneLicenseHTML;
          
          currentXmlData = new XMLSerializer().serializeToString(xmlDoc);
          loadData(currentXmlData);
          
          //return xmlData;
          
        }
      };
    }
  };
};

function restructureSATBtoFourStaves(meiXmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(meiXmlString, "application/xml");
 
  const scoreDefs = xmlDoc.querySelectorAll('scoreDef');
  scoreDefs.forEach((sd, i) => {
      console.log(`scoreDef[${i}] midi.bpm:`, sd.getAttribute('midi.bpm'));
  });

  // Remove old staffDefs, add four new ones
  const scoreDef = xmlDoc.querySelector('scoreDef');
  scoreDef.querySelectorAll('staffDef').forEach(sd => sd.remove());
  const staffNames = ["Soprano", "Alto", "Tenor", "Bass"];
  for (let i = 0; i < 4; i++) {
    const staffDef = xmlDoc.createElement('staffDef');
    staffDef.setAttribute('n', (i + 1).toString());
    staffDef.setAttribute('label', staffNames[i]);
    scoreDef.appendChild(staffDef);
  }

  // For each measure
  xmlDoc.querySelectorAll('measure').forEach(measure => {
    // Find old staff/layer elements
    const oldStaves = Array.from(measure.querySelectorAll('staff'));
    const layers = [ [null, null], [null, null] ];
    oldStaves.forEach(staffEl => {
      const staff_n = parseInt(staffEl.getAttribute('n')) - 1;
      Array.from(staffEl.querySelectorAll('layer')).forEach(layerEl => {
        const layer_n = parseInt(layerEl.getAttribute('n')) - 1;
        layers[staff_n][layer_n] = layerEl;
      });
    });

    // Remove old staves
    oldStaves.forEach(staffEl => staffEl.remove());

    // Create new staves for S, A, T, B
    for (let i = 0; i < 4; i++) {
      const newStaff = xmlDoc.createElement('staff');
      newStaff.setAttribute('n', (i + 1).toString());

      const newLayer = xmlDoc.createElement('layer');
      newLayer.setAttribute('n', '1');

      let sourceLayer = null;
      if      (i === 0 && layers[0][0]) sourceLayer = layers[0][0];
      else if (i === 1 && layers[0][1]) sourceLayer = layers[0][1];
      else if (i === 2 && layers[1][0]) sourceLayer = layers[1][0];
      else if (i === 3 && layers[1][1]) sourceLayer = layers[1][1];

      if (sourceLayer) {
        Array.from(sourceLayer.childNodes).forEach(node => {
          const cloned = node.cloneNode(true);
          // Explicitly preserve xml:id if present
          if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute("xml:id")) {
            cloned.setAttribute("xml:id", node.getAttribute("xml:id"));
          }
          newLayer.appendChild(cloned);
        });
      }

      newStaff.appendChild(newLayer);
      measure.appendChild(newStaff);
    }
  });

  return new XMLSerializer().serializeToString(xmlDoc);
}
