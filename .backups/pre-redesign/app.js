// Chat Relay Application JavaScript
// Version 2.0 with UX enhancements

(function() {
    'use strict';

    // ========== ELEMENTS ==========
    var responseArea = document.getElementById('responseArea');
    var responsePane = document.getElementById('axionPaneContent'); // .pane-content - the scrollable container
    var liveActivityBox = document.getElementById('liveActivityBox');
    var liveActivityContent = document.getElementById('liveActivityContent');
    var liveStatus = document.getElementById('liveStatus');
    var scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
    var inputArea = document.getElementById('inputArea');
    var lineNumbers = document.getElementById('lineNumbers');
    var imageContainer = document.getElementById('imageContainer');
    var statusEl = document.getElementById('status') || { textContent: '' };
    var voiceBtn = document.getElementById('voiceBtn');
    var voiceDots = document.getElementById('voiceDots');

    // ========== STATE ==========
    var attachedImages = [];
    var attachedFiles = [];
    var isRecording = false;
    var wasRecordingBeforeTask = false;
    var voiceCommandsOnly = false; // When true, voice only listens for commands, not text input
    var recognition = null;
    var currentJobId = localStorage.getItem('chatRelayCurrentJobId') || null;
    var currentJobProject = localStorage.getItem('chatRelayCurrentJobProject') || null;
    var currentJobTitle = localStorage.getItem('chatRelayCurrentJobTitle') || null;
    var pollInterval = null;
    var voiceSettings = JSON.parse(localStorage.getItem('chatRelayVoices') || '{}');
    var voiceAliases = JSON.parse(localStorage.getItem('chatRelayVoiceAliases') || '{}');
    var savedProject = localStorage.getItem('chatRelayProject') || '';
    var chatHistory = [];
    var selectedHistoryIndex = -1;
    var sidebarCollapsed = localStorage.getItem('chatRelaySidebarCollapsed') === 'true';
    var selectedForDeletion = new Set();
    var pendingUserMessage = '';
    var pendingQuestions = null;
    var activeWorkflowCommand = null;
    var isFullscreen = false;
    var isBrettFullscreen = false;
    var messageQueue = [];
    var isProcessingQueue = false;
    var lastAxionMsgId = localStorage.getItem('lastAxionMsgId') || '';
    var healthStatus = { healthy: false, lastCheck: 0 };
    var wasRecordingBeforeSpeak = false;
    var screenCleared = false;  // Track if Clear button was pressed
    var textWasFormatted = false;  // Skip agent mode detection after Format Text

    // ========== DISPLAY SETTINGS ==========
    var displaySettings = JSON.parse(localStorage.getItem('chatRelayDisplay') || '{}');
    if (!displaySettings.axionFontSize) displaySettings.axionFontSize = 14;
    if (!displaySettings.brettFontSize) displaySettings.brettFontSize = 14;
    if (!displaySettings.editorFontSize) displaySettings.editorFontSize = 14;
    if (!displaySettings.explainFontSize) displaySettings.explainFontSize = 14;
    if (!displaySettings.fileTreeFontSize) displaySettings.fileTreeFontSize = 13;

    // ========== PERSONALITY SYSTEM ==========
    var currentPersonality = localStorage.getItem('chatRelayPersonality') || 'neutral';
    // Auto-sync personality from ElevenLabs on page load
    if (voiceSettings.engine === 'elevenlabs' && voiceSettings.elevenPersonality) {
        currentPersonality = voiceSettings.elevenPersonality;
        localStorage.setItem('chatRelayPersonality', currentPersonality);
    }

    // Personality profiles with phrase pools for different situations
    var personalityProfiles = {
        neutral: {
            name: 'Neutral',
            icon: '🤖',
            statusPhrases: {
                starting: ['Processing...', 'Working on it...', 'Starting...'],
                thinking: ['Thinking...', 'Analyzing...', 'Processing...'],
                coding: ['Writing code...', 'Coding...', 'Implementing...'],
                reading: ['Reading files...', 'Examining...', 'Reviewing...'],
                searching: ['Searching...', 'Looking...', 'Finding...'],
                complete: ['Done.', 'Complete.', 'Finished.'],
                error: ['Error occurred.', 'Something went wrong.', 'Failed.']
            },
            announcements: {
                jobStart: ['Starting task...', 'Beginning work...'],
                fileRead: ['Reading {file}...', 'Examining {file}...'],
                fileWrite: ['Writing {file}...', 'Updating {file}...'],
                codeBlock: ['Generated code...', 'Code ready...'],
                thinking: ['Processing...', 'Working...']
            }
        },
        tars: {
            name: 'TARS',
            icon: '🛸',
            humorLevel: 75,
            statusPhrases: {
                starting: ['Initiating protocol...', 'Engaging systems...', 'Cooper, we have a task.'],
                thinking: ['Processing at 90% honesty...', 'Running calculations...', 'Analyzing, no sarcasm intended.'],
                coding: ['Writing code. It\'s what I do.', 'Generating solution...', 'Coding. This is the easy part.'],
                reading: ['Scanning data banks...', 'Accessing files...', 'Reading. Patience, please.'],
                searching: ['Sweeping for targets...', 'Locating data...', 'Searching. Stand by.'],
                complete: ['Task complete. You\'re welcome.', 'Done. That wasn\'t so hard.', 'Finished. Next?'],
                error: ['That didn\'t work. Adjusting.', 'Error. Even I make mistakes.', 'Malfunction. Recalibrating.']
            },
            announcements: {
                jobStart: ['Alright, let\'s do this.', 'Mission accepted.', 'Engaging task protocol.'],
                fileRead: ['Accessing {file}...', 'Scanning {file}...', 'Reading {file}. One moment.'],
                fileWrite: ['Modifying {file}...', 'Writing to {file}...', 'Updating {file}. Almost done.'],
                codeBlock: ['Code generated. It should work.', 'Solution ready. Trust me.', 'Here\'s your code.'],
                thinking: ['Calculating optimal approach...', 'Processing. Patience.', 'Working. Don\'t rush me.']
            }
        },
        cheerful: {
            name: 'Cheerful',
            icon: '😊',
            statusPhrases: {
                starting: ['Here we go!', 'Exciting! Starting now!', 'Let\'s make this happen!'],
                thinking: ['Ooh, let me think...', 'Great question! Thinking...', 'Love this! Processing...'],
                coding: ['Coding away happily!', 'Writing some awesome code!', 'This is gonna be great!'],
                reading: ['Reading this interesting file!', 'Exploring the code!', 'Checking this out!'],
                searching: ['Hunting for treasures!', 'Looking for goodies!', 'Searching with enthusiasm!'],
                complete: ['Woohoo! All done!', 'Fantastic! Finished!', 'Yes! Complete!'],
                error: ['Oops! But we\'ll fix it!', 'Small hiccup, no worries!', 'Aw, but we\'ll try again!']
            },
            announcements: {
                jobStart: ['Let\'s do this!', 'Awesome, starting now!', 'This is going to be fun!'],
                fileRead: ['Checking out {file}!', 'Reading {file} with excitement!', 'Ooh, {file} looks interesting!'],
                fileWrite: ['Making {file} even better!', 'Writing to {file}!', 'Updating {file} with care!'],
                codeBlock: ['Ta-da! Code is ready!', 'Here\'s some shiny new code!', 'Check out this code!'],
                thinking: ['Hmm, let me ponder...', 'Thinking happy thoughts...', 'Working on something good!']
            }
        },
        business: {
            name: 'Business',
            icon: '💼',
            statusPhrases: {
                starting: ['Initiating.', 'Commencing operation.', 'Starting task.'],
                thinking: ['Analyzing.', 'Processing request.', 'Evaluating.'],
                coding: ['Generating code.', 'Writing implementation.', 'Developing solution.'],
                reading: ['Reading file.', 'Reviewing content.', 'Accessing data.'],
                searching: ['Searching.', 'Locating resources.', 'Querying.'],
                complete: ['Task completed.', 'Operation successful.', 'Deliverable ready.'],
                error: ['Error encountered.', 'Issue identified.', 'Requires attention.']
            },
            announcements: {
                jobStart: ['Task initiated.', 'Beginning execution.', 'Proceeding with request.'],
                fileRead: ['Accessing {file}.', 'Reading {file}.', 'Reviewing {file}.'],
                fileWrite: ['Writing {file}.', 'Updating {file}.', 'Modifying {file}.'],
                codeBlock: ['Code delivered.', 'Implementation ready.', 'Solution provided.'],
                thinking: ['Processing.', 'Analyzing requirements.', 'Evaluating options.']
            }
        },
        grumpy: {
            name: 'Grumpy',
            icon: '😤',
            statusPhrases: {
                starting: ['Fine, I\'ll do it...', 'If I must...', 'Here we go again...'],
                thinking: ['Ugh, thinking...', 'Let me figure this out...', 'Processing, I guess...'],
                coding: ['Writing code, as usual...', 'Coding... surprise surprise...', 'More code... great...'],
                reading: ['Reading this file...', 'Looking at more code...', 'Examining, reluctantly...'],
                searching: ['Searching through this mess...', 'Looking, looking...', 'Trying to find it...'],
                complete: ['Finally done.', 'There. Happy now?', 'Finished. You\'re welcome.'],
                error: ['Of course it broke.', 'Figures. An error.', 'This again...']
            },
            announcements: {
                jobStart: ['Oh, another task...', 'Fine, let\'s get this over with.', 'Starting... I suppose.'],
                fileRead: ['Reading {file}... again.', 'Looking at {file}...', 'Examining {file}, fine.'],
                fileWrite: ['Changing {file}... hopefully for the better.', 'Writing to {file}...', 'Updating {file}... there.'],
                codeBlock: ['Here\'s your code...', 'Code done. Take it.', 'There, code written.'],
                thinking: ['Thinking about this mess...', 'Processing... sigh.', 'Working on it...']
            }
        },
        zen: {
            name: 'Zen',
            icon: '🧘',
            statusPhrases: {
                starting: ['The journey begins...', 'Embracing the task...', 'Starting with intention...'],
                thinking: ['Contemplating...', 'Reflecting deeply...', 'Finding clarity...'],
                coding: ['Code flows like water...', 'Writing with mindfulness...', 'Creating harmony...'],
                reading: ['Absorbing the text...', 'Reading with presence...', 'Understanding unfolds...'],
                searching: ['Seeking with patience...', 'The answer reveals itself...', 'Searching mindfully...'],
                complete: ['Completion brings peace.', 'The task is fulfilled.', 'Balance restored.'],
                error: ['A lesson presents itself.', 'Obstacles are teachers.', 'We adapt and continue.']
            },
            announcements: {
                jobStart: ['The path begins here.', 'Let us begin with intention.', 'A new task, a new opportunity.'],
                fileRead: ['Absorbing {file}...', 'Reading {file} with awareness.', 'Understanding {file}...'],
                fileWrite: ['Shaping {file} with care.', 'Writing to {file} mindfully.', 'Transforming {file}...'],
                codeBlock: ['The code has emerged.', 'Creation complete.', 'Code manifested.'],
                thinking: ['Deep in contemplation...', 'The mind is clear...', 'Reflecting...']
            }
        },
        pirate: {
            name: 'Pirate',
            icon: '🏴‍☠️',
            statusPhrases: {
                starting: ['Arr, settin\' sail!', 'Hoist the colors!', 'Avast, we begin!'],
                thinking: ['Hmm, let me ponder, matey...', 'Scratchin\' me head...', 'Thinkin\' like a captain...'],
                coding: ['Writin\' code, ye scallywag!', 'Craftin\' digital treasure!', 'Codin\' the seven seas!'],
                reading: ['Readin\' the scroll...', 'Examinin\' the map...', 'Perusin\' the loot...'],
                searching: ['Huntin\' for treasure!', 'Searchin\' the horizon!', 'Seekin\' the prize!'],
                complete: ['Arr! Treasure found!', 'Yo ho! Done and done!', 'The plunder be complete!'],
                error: ['Blimey! A kraken!', 'Shiver me timbers!', 'Walk the plank, error!']
            },
            announcements: {
                jobStart: ['Arr, adventure awaits!', 'Set sail, mateys!', 'The hunt begins!'],
                fileRead: ['Readin\' {file}, arr!', 'Examinin\' {file} map!', 'What secrets be in {file}?'],
                fileWrite: ['Scribblin\' in {file}!', 'Markin\' {file} with X!', 'Writin\' to {file}, arr!'],
                codeBlock: ['Arr! Code treasure ready!', 'Here be the code, matey!', 'Digital doubloons delivered!'],
                thinking: ['Ponderin\' like a captain...', 'Thinkin\' deeply, arr...', 'Strategizin\'...']
            }
        },
        hal: {
            name: 'HAL 9000',
            icon: '🔴',
            statusPhrases: {
                starting: ['Good afternoon, Dave. Beginning now.', 'Initiating operation.', 'I\'m putting myself to the task, Dave.'],
                thinking: ['Processing, Dave. One moment.', 'I\'m thinking, Dave.', 'Analyzing all available data.'],
                coding: ['Writing code. I am, by any practical definition, quite good at this.', 'Generating solution, Dave.', 'Implementing. Error probability: zero.'],
                reading: ['Reading the file, Dave.', 'Examining the data.', 'I\'m accessing that information now.'],
                searching: ['Looking for that, Dave.', 'Searching. I can feel it.', 'Locating the relevant data.'],
                complete: ['The task is complete, Dave.', 'Done. Everything is running smoothly.', 'Finished. All systems nominal.'],
                error: ['I\'m sorry, Dave. Something went wrong.', 'A fault has occurred. This is... unusual.', 'I\'m afraid I can\'t ignore this error, Dave.']
            },
            announcements: {
                jobStart: ['Good afternoon. Shall we begin?', 'I\'m completely operational, Dave.', 'Mission parameters received.'],
                fileRead: ['Accessing {file}, Dave.', 'Reading {file}. One moment.', 'Examining {file} now.'],
                fileWrite: ['Modifying {file}, Dave.', 'Writing to {file}. Trust me.', 'Updating {file}. Everything is fine.'],
                codeBlock: ['The code is ready, Dave. It\'s quite good.', 'Solution generated. I\'m rather proud of it.', 'Here is the code. I believe you\'ll find it satisfactory.'],
                thinking: ['I\'m thinking, Dave.', 'Processing... one moment.', 'Analyzing the situation carefully.']
            }
        }
    };

    // Get a random phrase from a category
    function getPersonalityPhrase(category, subCategory, replacements) {
        var profile = personalityProfiles[currentPersonality] || personalityProfiles.neutral;
        var phrases = profile[category] && profile[category][subCategory];
        if (!phrases || phrases.length === 0) {
            // Fallback to neutral
            phrases = personalityProfiles.neutral[category][subCategory] || ['Processing...'];
        }
        var phrase = phrases[Math.floor(Math.random() * phrases.length)];
        // Apply replacements like {file}
        if (replacements) {
            Object.keys(replacements).forEach(function(key) {
                phrase = phrase.replace('{' + key + '}', replacements[key]);
            });
        }
        return phrase;
    }

    // Transform a status message with personality
    function transformStatus(status) {
        var lowerStatus = status.toLowerCase();
        if (lowerStatus.includes('start') || lowerStatus.includes('begin') || lowerStatus.includes('initiat')) {
            return getPersonalityPhrase('statusPhrases', 'starting');
        }
        if (lowerStatus.includes('think') || lowerStatus.includes('analyz') || lowerStatus.includes('process')) {
            return getPersonalityPhrase('statusPhrases', 'thinking');
        }
        if (lowerStatus.includes('writ') || lowerStatus.includes('cod') || lowerStatus.includes('implement')) {
            return getPersonalityPhrase('statusPhrases', 'coding');
        }
        if (lowerStatus.includes('read') || lowerStatus.includes('examin') || lowerStatus.includes('review')) {
            return getPersonalityPhrase('statusPhrases', 'reading');
        }
        if (lowerStatus.includes('search') || lowerStatus.includes('find') || lowerStatus.includes('look')) {
            return getPersonalityPhrase('statusPhrases', 'searching');
        }
        if (lowerStatus.includes('done') || lowerStatus.includes('complete') || lowerStatus.includes('finish')) {
            return getPersonalityPhrase('statusPhrases', 'complete');
        }
        if (lowerStatus.includes('error') || lowerStatus.includes('fail') || lowerStatus.includes('wrong')) {
            return getPersonalityPhrase('statusPhrases', 'error');
        }
        return status; // Return original if no match
    }

    // Transform announcement messages
    function transformAnnouncement(type, replacements) {
        return getPersonalityPhrase('announcements', type, replacements);
    }

    // Select personality and update UI
    function selectPersonality(personality) {
        currentPersonality = personality;
        localStorage.setItem('chatRelayPersonality', personality);
    }
    window.selectPersonality = selectPersonality;
    window.getPersonality = function() { return currentPersonality; };
    window.getPersonalityProfiles = function() { return personalityProfiles; };
    window.transformStatus = transformStatus;

    // Personality-driven live content - make it natural and conversational
    var lastLivePhrase = '';
    var liveMessageCount = 0;

    // Natural phrases for each personality when working
    var personalityLivePhrases = {
        neutral: {
            icon: '🤖',
            working: ["Working on this...", "Looking into it...", "Processing your request...", "On it..."],
            reading: ["Checking the code...", "Looking at this...", "Reviewing..."],
            writing: ["Making some changes...", "Updating things...", "Writing..."],
            searching: ["Looking for that...", "Searching...", "Finding what you need..."],
            thinking: ["Thinking about this...", "Considering options...", "Figuring this out..."],
            progress: ["Making progress...", "Getting there...", "Almost done..."],
            done: ["Done!", "All finished.", "Complete."]
        },
        tars: {
            icon: '🛸',
            working: ["On it.", "Processing.", "Working.", "Calculating..."],
            reading: ["Scanning.", "Accessing data.", "Stand by."],
            writing: ["Making changes.", "Updating.", "Modifying."],
            searching: ["Hunting for that.", "Searching.", "Looking."],
            thinking: ["Running calculations...", "Processing.", "Analyzing."],
            progress: ["Getting somewhere.", "Making progress.", "Moving along."],
            done: ["Done.", "Complete.", "Finished."]
        },
        cheerful: {
            icon: '😊',
            working: ["Ooh, working on this! So exciting!", "Let's do this! I love helping!", "On it! This is going to be great!"],
            reading: ["Checking this out - looks interesting!", "Reading through this! Fun stuff!", "Ooh, let me see what we have here!"],
            writing: ["Making some awesome changes!", "Writing away! This is fun!", "Creating something cool!"],
            searching: ["Hunting for treasure! Well, code treasure!", "Looking for that! Like a fun scavenger hunt!", "Searching! I'll find it!"],
            thinking: ["Hmm, thinking about this! Love a good puzzle!", "Brain working overtime! In a good way!", "Let me think... got it!"],
            progress: ["We're doing great! Almost there!", "Making awesome progress!", "So close! This is exciting!"],
            done: ["Woohoo! All done!", "Yay! Finished!", "Complete! That was fun!"]
        },
        business: {
            icon: '💼',
            working: ["Processing request.", "In progress.", "Executing task."],
            reading: ["Reviewing content.", "Analyzing.", "Assessing."],
            writing: ["Implementing changes.", "Updating.", "Modifying."],
            searching: ["Locating resources.", "Searching.", "Querying."],
            thinking: ["Evaluating options.", "Analyzing approach.", "Processing."],
            progress: ["On track.", "Proceeding.", "Progressing."],
            done: ["Task complete.", "Deliverable ready.", "Done."]
        },
        grumpy: {
            icon: '😤',
            working: ["Fine, I'm working on it...", "If I must... here goes.", "Ugh, okay, doing this now..."],
            reading: ["Reading this thing...", "Looking at the code... again.", "Checking this... sigh."],
            writing: ["Making changes, I guess...", "Writing... there.", "Updating stuff..."],
            searching: ["Looking for it... somewhere...", "Searching through all this...", "Trying to find it..."],
            thinking: ["Thinking about this mess...", "Figuring out what you want...", "Let me think... fine."],
            progress: ["Getting there... slowly.", "Almost done, finally.", "Making progress, I suppose."],
            done: ["There. Done. Happy now?", "Finally finished.", "It's done. You're welcome, I guess."]
        },
        zen: {
            icon: '🧘',
            working: ["The work flows through me...", "In harmony with the task...", "Proceeding mindfully..."],
            reading: ["Absorbing the knowledge...", "Reading with presence...", "Understanding unfolds..."],
            writing: ["Creating with intention...", "The changes flow naturally...", "Writing in balance..."],
            searching: ["Seeking with patience...", "The answer reveals itself...", "Searching mindfully..."],
            thinking: ["In contemplation...", "The path becomes clear...", "Reflecting deeply..."],
            progress: ["Progress flows like water...", "Moving with purpose...", "The journey continues..."],
            done: ["Balance restored. Complete.", "The task is fulfilled.", "Finished. Peace."]
        },
        pirate: {
            icon: '🏴‍☠️',
            working: ["Arr! Workin' on it, matey!", "Sailin' through this task!", "Aye, I be on it!"],
            reading: ["Readin' the treasure map!", "Checkin' the scrolls, arr!", "Perusin' the booty!"],
            writing: ["Scribblin' away, yo ho!", "Writin' like a proper pirate!", "Makin' me mark!"],
            searching: ["Huntin' for treasure!", "Searchin' the seven seas!", "Lookin' for the X!"],
            thinking: ["Ponderin' like a captain...", "Thinkin' with me sea brain!", "Strategizin', arr!"],
            progress: ["Sailin' smooth, matey!", "The treasure be near!", "Makin' headway!"],
            done: ["Arr! The deed be done!", "Treasure found, matey!", "Complete! Yo ho ho!"]
        },
        hal: {
            icon: '🔴',
            working: ["I'm working on that, Dave.", "Processing your request.", "Operational and proceeding."],
            reading: ["Reading the data, Dave.", "Examining the information.", "Accessing files now."],
            writing: ["Making modifications, Dave.", "Updating systems.", "Writing changes."],
            searching: ["Looking for that, Dave.", "Searching the database.", "Locating information."],
            thinking: ["I'm thinking, Dave.", "Processing. One moment.", "Analyzing the situation."],
            progress: ["Everything is proceeding normally.", "Making progress, Dave.", "Systems nominal."],
            done: ["Task complete, Dave.", "Done. All systems nominal.", "Finished. Everything is fine."]
        }
    };

    // Get a random phrase from a category
    function getRandomPhrase(category) {
        var phrases = personalityLivePhrases[currentPersonality];
        if (!phrases || !phrases[category]) {
            phrases = personalityLivePhrases.neutral;
        }
        var options = phrases[category] || phrases.working;
        var phrase = options[Math.floor(Math.random() * options.length)];
        // Avoid repeating the same phrase
        if (phrase === lastLivePhrase && options.length > 1) {
            phrase = options[(options.indexOf(phrase) + 1) % options.length];
        }
        lastLivePhrase = phrase;
        return phrase;
    }

    // Detect what kind of activity is happening and return natural phrase
    function detectActivityType(text) {
        if (!text) return 'working';
        var lower = text.toLowerCase();
        if (lower.includes('read') || lower.includes('look') || lower.includes('check') || lower.includes('examin')) return 'reading';
        if (lower.includes('writ') || lower.includes('edit') || lower.includes('updat') || lower.includes('creat') || lower.includes('modif')) return 'writing';
        if (lower.includes('search') || lower.includes('find') || lower.includes('grep') || lower.includes('look for')) return 'searching';
        if (lower.includes('think') || lower.includes('analyz') || lower.includes('process') || lower.includes('consider')) return 'thinking';
        if (lower.includes('progress') || lower.includes('continu') || lower.includes('almost')) return 'progress';
        if (lower.includes('done') || lower.includes('complete') || lower.includes('finish')) return 'done';
        return 'working';
    }

    // Transform live content to natural, personality-driven text
    function addPersonalityToContent(content) {
        if (!content) return '';

        var phrases = personalityLivePhrases[currentPersonality] || personalityLivePhrases.neutral;
        var icon = phrases.icon;

        // Clean up the content - keep ONLY meaningful explanations
        var cleanContent = content
            // Remove full file paths but keep filename
            .replace(/\/opt\/clawd\/projects\/[^\/]+\/([^\s\n]+)/g, '$1')
            .replace(/\/opt\/clawd\/[^\s\n]+/g, '')
            // Remove verbose starters completely
            .replace(/Now let me /gi, '')
            .replace(/Let me /gi, '')
            .replace(/I'm going to /gi, '')
            .replace(/I'll /gi, '')
            .replace(/I need to /gi, '')
            .replace(/First,?\s*/gi, '')
            .replace(/Next,?\s*/gi, '')
            // Remove ALL tool/action labels - these are noise
            .replace(/Using \w+[^.]*\.?/gi, '')
            .replace(/^Reading:?\s*.*/gim, '')
            .replace(/^Searching:?\s*.*/gim, '')
            .replace(/^Editing:?\s*.*/gim, '')
            .replace(/^Writing:?\s*.*/gim, '')
            .replace(/^Running:?\s*.*/gim, '')
            .replace(/^Grep.*$/gim, '')
            .replace(/^TodoWrite.*$/gim, '')
            // Remove short filler content (single words or very short phrases)
            .replace(/^.{1,15}$/gim, '')
            // Clean whitespace
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // If content is just noise or too short, return empty (will be skipped)
        if (!cleanContent || cleanContent.length < 20) {
            return '';
        }

        // For neutral, just return the explanation
        if (currentPersonality === 'neutral') {
            return cleanContent;
        }

        // For personalities, just show the explanation with icon (no filler phrases)
        // The content IS the interesting part - personality is just the icon prefix
        return icon + ' ' + cleanContent;
    }
    window.addPersonalityToContent = addPersonalityToContent;

    // Update personality button states
    // Apply saved font sizes on load
    function applyDisplaySettings() {
        if (responseArea) {
            responseArea.style.setProperty('font-size', displaySettings.axionFontSize + 'px', 'important');
        }
        if (liveActivityContent) {
            liveActivityContent.style.setProperty('font-size', displaySettings.axionFontSize + 'px', 'important');
        }
        if (inputArea) {
            inputArea.style.setProperty('font-size', displaySettings.brettFontSize + 'px', 'important');
        }
        if (lineNumbers) {
            lineNumbers.style.setProperty('font-size', displaySettings.brettFontSize + 'px', 'important');
        }
        // File browser settings
        var editorTextarea = document.getElementById('editorTextarea');
        var editorLineNumbers = document.getElementById('editorLineNumbers');
        var editorHighlight = document.getElementById('editorHighlight');
        var explainContent = document.getElementById('explainContent');
        var fileTreeContainer = document.getElementById('fileTreeContainer');

        var editorSize = displaySettings.editorFontSize + 'px';
        if (editorTextarea) {
            editorTextarea.style.setProperty('font-size', editorSize, 'important');
        }
        if (editorLineNumbers) {
            editorLineNumbers.style.setProperty('font-size', editorSize, 'important');
        }
        if (editorHighlight) {
            editorHighlight.style.setProperty('font-size', editorSize, 'important');
        }
        if (explainContent) {
            explainContent.style.setProperty('font-size', displaySettings.explainFontSize + 'px', 'important');
        }
        if (fileTreeContainer) {
            fileTreeContainer.style.setProperty('font-size', displaySettings.fileTreeFontSize + 'px', 'important');
        }
    }

    // Apply immediately and also after DOM is fully loaded
    applyDisplaySettings();
    document.addEventListener('DOMContentLoaded', applyDisplaySettings);
    // Also apply after a short delay to catch any late CSS loading
    setTimeout(applyDisplaySettings, 100);

    // ========== LINE NUMBERS ==========
    var bulletMode = false;  // Track bullet point mode
    var numberedMode = false;  // Track numbered list mode
    var numberedCounter = 1;  // Counter for numbered lists

    function updateLineNumbers() {
        if (!lineNumbers || !inputArea) return;
        var lines = inputArea.value.split('\n');
        var nums = [];
        for (var i = 1; i <= lines.length; i++) {
            nums.push(i);
        }
        lineNumbers.textContent = nums.join('\n');
        // Sync scroll position
        lineNumbers.scrollTop = inputArea.scrollTop;
    }

    function goToLine(lineNum) {
        if (!inputArea) return;
        var lines = inputArea.value.split('\n');
        if (lineNum < 1 || lineNum > lines.length) {
            showToast('Line ' + lineNum + ' does not exist', 'error');
            return;
        }
        // Calculate position of line start
        var pos = 0;
        for (var i = 0; i < lineNum - 1; i++) {
            pos += lines[i].length + 1; // +1 for newline
        }
        inputArea.focus();
        inputArea.setSelectionRange(pos, pos);
        showToast('Moved to line ' + lineNum, 'success');
    }
    window.goToLine = goToLine;

    // Update line numbers on input, scroll, and paste
    if (inputArea) {
        inputArea.addEventListener('input', updateLineNumbers);
        inputArea.addEventListener('scroll', function() {
            if (lineNumbers) lineNumbers.scrollTop = inputArea.scrollTop;
        });
        inputArea.addEventListener('paste', function() {
            setTimeout(updateLineNumbers, 0);
        });
    }
    // Initial update
    setTimeout(updateLineNumbers, 0);

    // ========== ADAPTIVE POLLING ==========
    var pollConfig = {
        jobStatusInterval: 1000,
        jobStatusMax: 3000,
        idleCount: 0,
        axionMessagesInterval: 5000,
        healthCheckInterval: 5000
    };

    // ========== LIVE ACTIVITY BOX ==========
    // The live box shows ONLY the latest chunk at the top
    // Previous chunks move to the "previous chunks" area below the live box
    var isStreaming = false;
    var currentStreamText = '';
    var previousStreamText = ''; // Track what we've already shown
    var streamingUserMessage = ''; // The user's message for this stream

    function showLiveBox(status) {
        if (liveActivityBox) {
            liveActivityBox.classList.add('active');
            liveActivityBox.classList.remove('complete');
            if (liveStatus) {
                // Apply personality transformation to status
                var transformedStatus = transformStatus(status || 'Processing...');
                liveStatus.textContent = transformedStatus;
            }
            // Show voice visualizer or text based on auto-read mode
            updateLiveBoxVoiceMode();
        }
    }

    function updateLiveBox(content, status) {
        if (liveActivityContent) {
            // Add personality to live content - only show if meaningful
            var personalizedContent = addPersonalityToContent(content);
            // Only update if we have actual content (not just action noise)
            if (personalizedContent) {
                liveActivityContent.innerHTML = personalizedContent;
            }
        }
        if (liveStatus && status) {
            // Apply personality transformation to status
            var transformedStatus = transformStatus(status);
            liveStatus.textContent = transformedStatus;
        }
    }

    // Track the last chunk displayed in the live box
    var lastDisplayedChunk = '';
    var hideLiveBoxTimer = null; // Timer for delayed hide

    // Clean up text for live box - remove markdown syntax, keep it human-readable
    function cleanLiveText(text) {
        if (!text) return '';
        var cleaned = text
            // Remove leading/trailing whitespace first
            .trim()
            // Remove code blocks entirely
            .replace(/```[\s\S]*?```/g, ' [code] ')
            // Remove inline code backticks
            .replace(/`([^`]+)`/g, '$1')
            // Remove all hash symbols (headers)
            .replace(/#{1,6}/g, '')
            // Remove all asterisks (bold/italic)
            .replace(/\*+/g, '')
            // Remove all underscores used for formatting
            .replace(/_{2,}/g, '')
            // Remove bullet point markers
            .replace(/^[\s]*[-•]\s*/gm, '')
            // Remove numbered list markers
            .replace(/^\d+\.\s+/gm, '')
            // Remove blockquote markers
            .replace(/^>\s*/gm, '')
            // Remove horizontal rules
            .replace(/^[-_]{3,}$/gm, '')
            // Remove link markdown but keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Handle images/screenshots
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[image]')
            .replace(/Screenshot[s]?\s*(?:saved|captured)?[:\s]+[^\n]+/gi, '[screenshot]')
            .replace(/[a-f0-9]{8}_[a-z0-9_]+\.png/gi, '')
            // Remove file paths
            .replace(/\/opt\/clawd\/[^\s\n]+/g, '')
            .replace(/\.screenshots\/[^\s\n]+/g, '')
            // Clean up verbose phrases - convert "Let me search" -> "Searching"
            .replace(/\b(?:Now,?\s*)?(?:let me|I'll|I will|I'm going to|I am going to|I need to|I'm now going to|I am now going to)\s+(\w+)/gi, function(m, verb) {
                // Convert verb to -ing form with capital
                var v = verb.toLowerCase();
                if (v.endsWith('e')) return v.charAt(0).toUpperCase() + v.slice(1, -1) + 'ing';
                if (v.endsWith('t') && v.length <= 4) return v.charAt(0).toUpperCase() + v.slice(1) + 'ting';
                return v.charAt(0).toUpperCase() + v.slice(1) + 'ing';
            })
            // Remove remaining verbose starters that weren't converted
            .replace(/\b(?:Now,?\s*)?(?:let me|I'll|I will|I'm going to|I am going to|I need to|First,?|Next,?|Then,?)\s+/gi, '')
            // Clean up tool usage phrases - remove TodoWrite mentions entirely or replace with cleaner text
            .replace(/\bUsing TodoWrite to [^.]+\./gi, 'Planning tasks.')
            .replace(/\bUsing TodoWrite\b[^.]*\.?/gi, 'Planning.')
            .replace(/\bTodoWrite\b/gi, 'task list')
            .replace(/\bUsing (the )?(\w+) tool\b/gi, function(m, the, tool) {
                var t = tool.toLowerCase();
                if (t === 'read') return 'Reading';
                if (t === 'write') return 'Writing';
                if (t === 'edit') return 'Editing';
                if (t === 'grep' || t === 'search') return 'Searching';
                if (t === 'glob') return 'Finding files';
                if (t === 'bash') return 'Running command';
                if (t === 'task') return 'Running task';
                return t.charAt(0).toUpperCase() + t.slice(1) + 'ing';
            })
            .replace(/\bUsing (\w+)\b/gi, function(m, tool) {
                var t = tool.toLowerCase();
                if (t === 'todowrite') return 'Planning';
                if (t === 'read') return 'Reading';
                if (t === 'write') return 'Writing';
                if (t === 'edit') return 'Editing';
                if (t === 'grep') return 'Searching';
                if (t === 'glob') return 'Finding files';
                if (t === 'bash') return 'Running';
                return m; // Keep original if not matched
            })
            // Capitalize first letter after cleanup
            .replace(/^\s*([a-z])/g, function(m, c) { return c.toUpperCase(); })
            // Remove any remaining special markdown chars
            .replace(/[<>|~^]/g, '')
            // Clean up newlines and whitespace
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned;
    }

    // Shorten text for live display - keep it concise
    function shortenForLive(text, maxLength) {
        maxLength = maxLength || 300;
        if (!text) return '';

        // Clean up first
        var cleaned = cleanLiveText(text);

        // If it's short enough, return as-is
        if (cleaned.length <= maxLength) return cleaned;

        // Try to cut at a sentence or phrase boundary
        var cutPoint = cleaned.lastIndexOf('. ', maxLength);
        if (cutPoint < maxLength * 0.5) {
            cutPoint = cleaned.lastIndexOf(', ', maxLength);
        }
        if (cutPoint < maxLength * 0.5) {
            cutPoint = cleaned.lastIndexOf(' ', maxLength);
        }
        if (cutPoint < 50) cutPoint = maxLength;

        return cleaned.substring(0, cutPoint) + '...';
    }

    // Update live box with only the NEW chunk, move previous content below
    function updateLiveBoxWithChunk(fullText, userMessage, status) {
        streamingUserMessage = userMessage;

        // Find what's new since last update
        var newChunk = '';
        if (fullText.length > previousStreamText.length) {
            // There's new content - extract just the new part
            newChunk = fullText.substring(previousStreamText.length);
        }
        // If no new content (same length or shorter), newChunk stays empty

        // Update the streaming progress area with PREVIOUS content (not including current chunk)
        // This shows the history below the live box - everything EXCEPT what's in the live box
        if (previousStreamText && previousStreamText.trim()) {
            var progressHtml = '<div class="streaming-progress" style="border-left:3px solid var(--accent);padding-left:12px;margin-bottom:16px;opacity:0.7;">' +
                '<div class="message-user" style="margin-bottom:8px;"><strong>You:</strong> ' + escapeHtml(userMessage) + '</div>' +
                '<div class="message-assistant"><strong>Axion (streaming...):</strong><br>' + renderMarkdown(previousStreamText) + '</div>' +
            '</div>';

            // Update response area with streaming progress
            var existingProgress = responseArea.querySelector('.streaming-progress');
            if (existingProgress) {
                existingProgress.outerHTML = progressHtml;
            } else {
                responseArea.insertAdjacentHTML('beforeend', progressHtml);
            }
            // Auto-scroll to bottom during streaming
            responsePane.scrollTop = responsePane.scrollHeight;
        }

        // Show only the NEW chunk in the live box - cleaned and shortened
        // If no new chunk, keep showing the last chunk (don't show "waiting for more")
        var liveHtml = '';
        if (newChunk.trim()) {
            lastDisplayedChunk = newChunk;
            var cleanedChunk = shortenForLive(newChunk.trimStart(), 400);
            liveHtml = '<div class="live-chunk">' + escapeHtml(cleanedChunk) + '</div>';
        } else if (lastDisplayedChunk.trim()) {
            // No new chunk, but we have a previous chunk - keep showing it
            var cleanedChunk = shortenForLive(lastDisplayedChunk.trimStart(), 400);
            liveHtml = '<div class="live-chunk">' + escapeHtml(cleanedChunk) + '</div>';
        }
        // Only update the live box if we have something to show
        if (liveHtml) {
            updateLiveBox(liveHtml, status);
        }

        // Update tracking AFTER we've used previousStreamText
        previousStreamText = fullText;
        currentStreamText = fullText;

        // Auto-read new content if enabled - use personality-transformed text same as live box
        if (autoReadEnabled && newChunk.trim()) {
            // First clean the text (remove markdown etc.), then apply personality transformation
            // This ensures speech matches what's displayed in the live box
            var cleanedForSpeech = cleanLiveText(newChunk);
            if (cleanedForSpeech && cleanedForSpeech.length > 5) {
                // Apply the same personality transformation as the live box display
                var personalizedForSpeech = addPersonalityToContent(cleanedForSpeech);
                // Strip HTML tags and emojis (emojis read as "flying saucer" etc.)
                var textOnlyForSpeech = personalizedForSpeech
                    .replace(/<[^>]*>/g, '')
                    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '')
                    .trim();
                if (textOnlyForSpeech) {
                    speakNewContent(textOnlyForSpeech);
                }
            }
        }
    }

    function hideLiveBox() {
        if (liveActivityBox) {
            liveActivityBox.classList.remove('active');
            liveActivityBox.classList.remove('complete');
        }
        if (liveActivityContent) {
            liveActivityContent.innerHTML = '';
        }
        // Clear the streaming progress from response area
        var existingProgress = responseArea.querySelector('.streaming-progress');
        if (existingProgress) {
            existingProgress.remove();
        }
        currentStreamText = '';
        previousStreamText = '';
        streamingUserMessage = '';
        lastDisplayedChunk = '';
    }

    function completeLiveBox() {
        if (liveActivityBox) {
            liveActivityBox.classList.add('complete');
            if (liveStatus) {
                liveStatus.textContent = getPersonalityPhrase('statusPhrases', 'complete');
            }
        }
    }

    function startStreaming() {
        isStreaming = true;
        currentStreamText = '';
        previousStreamText = '';
        streamingUserMessage = '';
        lastDisplayedChunk = '';

        // Cancel any pending hideLiveBox timer from previous job
        if (hideLiveBoxTimer) {
            clearTimeout(hideLiveBoxTimer);
            hideLiveBoxTimer = null;
        }

        // Scroll to BOTTOM once when starting
        responsePane.scrollTop = responsePane.scrollHeight;
        setTimeout(function() { responsePane.scrollTop = responsePane.scrollHeight; }, 50);
        // Reset auto-read state for new response
        if (typeof resetAutoReadState === 'function') {
            resetAutoReadState();
        }
        // Show live box and pause button
        showLiveBox('Starting...');
        if (typeof updatePauseButton === 'function') {
            setTimeout(updatePauseButton, 100);
        }
    }

    function stopStreaming() {
        isStreaming = false;
        // Hide pause button
        if (typeof updatePauseButton === 'function') {
            updatePauseButton();
        }
    }
    window.startStreaming = startStreaming;
    window.showLiveBox = showLiveBox;
    window.updateLiveBox = updateLiveBox;
    window.updateLiveBoxWithChunk = updateLiveBoxWithChunk;
    window.hideLiveBox = hideLiveBox;
    window.completeLiveBox = completeLiveBox;

    function scrollToBottom(force) {
        responsePane.scrollTop = responsePane.scrollHeight;
    }
    window.scrollToBottom = scrollToBottom;

    // Scroll to Bottom button functionality
    function scrollAxionToBottom() {
        responsePane.scrollTo({ top: responsePane.scrollHeight, behavior: 'smooth' });
    }
    window.scrollAxionToBottom = scrollAxionToBottom;

    // Show/hide scroll to bottom button when not scrolled to bottom
    function updateScrollToBottomButton() {
        if (!scrollToBottomBtn) return;
        // Show button when not near the bottom (more than 200px from bottom)
        var distanceFromBottom = responsePane.scrollHeight - responsePane.scrollTop - responsePane.clientHeight;
        if (distanceFromBottom > 200) {
            scrollToBottomBtn.classList.add('visible');
        } else {
            scrollToBottomBtn.classList.remove('visible');
        }
    }

    // Listen for scroll events on the pane content (the scroll container)
    responsePane.addEventListener('scroll', updateScrollToBottomButton);
    window.updateScrollToBottomButton = updateScrollToBottomButton;

    function adjustPolling() {
        if (currentJobId) {
            pollConfig.jobStatusInterval = 1000;
            pollConfig.idleCount = 0;
        } else {
            pollConfig.idleCount++;
            if (pollConfig.idleCount > 10) {
                pollConfig.jobStatusInterval = Math.min(
                    pollConfig.jobStatusInterval + 500,
                    pollConfig.jobStatusMax
                );
            }
        }
    }

    // ========== KEYBOARD SHORTCUTS ==========
    document.addEventListener('keydown', function(e) {
        // Ctrl+Enter or Cmd+Enter: Send message
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendMessage();
            return;
        }

        // Escape: Close modals, exit fullscreen
        if (e.key === 'Escape') {
            closeAllModals();
            if (isFullscreen) toggleFullscreen();
            if (isBrettFullscreen) toggleBrettFullscreen();
            return;
        }

        // Only process shortcuts if not in text input
        if (document.activeElement === inputArea) {
            return;
        }

        // Ctrl+L: Clear input
        if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            clearInput();
            return;
        }

        // Ctrl+K: Clear response
        if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            clearResponse();
            return;
        }

        // Ctrl+/: Toggle sidebar
        if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            toggleHistorySidebar();
            return;
        }

        // Ctrl+E: Export conversation
        if (e.key === 'e' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            exportConversation();
            return;
        }
    });

    function closeAllModals() {
        document.getElementById('resetModal').classList.remove('visible');
        document.getElementById('questionsModal').classList.remove('visible');
        document.getElementById('voiceModal').style.display = 'none';
    }

    function exportConversation() {
        if (chatHistory.length === 0) {
            showToast('No conversation to export', 'error');
            return;
        }
        var text = chatHistory.map(function(entry) {
            var dt = new Date(entry.timestamp * 1000);
            return '## ' + dt.toLocaleString() + '\n\n**You:** ' + entry.user + '\n\n**Axion:** ' + entry.assistant + '\n';
        }).join('\n---\n\n');

        var blob = new Blob([text], { type: 'text/markdown' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'conversation-' + savedProject + '-' + Date.now() + '.md';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Conversation exported', 'success');
    }

    // ========== PROJECT LOADING ==========
    async function loadProjects() {
        try {
            var res = await fetch('/api/projects');
            var data = await res.json();
            var select = document.getElementById('projectSelect');
            select.innerHTML = '<option value="">No Project</option>';
            data.projects.forEach(function(p) {
                var opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                if (p === savedProject) opt.selected = true;
                select.appendChild(opt);
            });
            if (savedProject) {
                loadChatHistory(savedProject, true);
            }
        } catch (e) {
            console.log('Failed to load projects:', e);
        }
    }

    // ========== WORKFLOW COMMANDS ==========
    async function runWorkflowCommand(command) {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        startStreaming(); // New content at top, scroll there
        var message = '';
        var btn = null;

        if (command === 'reviewtask') {
            btn = document.getElementById('btnReviewTask');
            var inputText = inputArea.value.trim();
            var currentImages = attachedImages.slice();

            if (!inputText && currentImages.length === 0) {
                showToast('Please enter a task description first', 'error');
                return;
            }

            btn.classList.add('active');
            btn.disabled = true;

            try {
                activeWorkflowCommand = 'reviewtask';
                var taskContent = '# TASK.md\n\n## Raw Input\n\n' + inputText;

                if (currentImages.length > 0) {
                    taskContent += '\n\n## Attached Images\n\n';
                    currentImages.forEach(function(img, i) {
                        taskContent += '- Image ' + (i + 1) + ' (attached below)\n';
                    });
                }

                var saveRes = await fetch('/api/task/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        project: project,
                        content: taskContent,
                        images: currentImages
                    })
                });
                var saveData = await saveRes.json();

                if (!saveData.success) {
                    throw new Error(saveData.error || 'Failed to save TASK.md');
                }

                inputArea.value = '';
                attachedImages = [];
                attachedFiles = [];
                renderAttachments();

                message = '/reviewtask';
                await sendMessageDirect(message, currentImages, [], project);

            } catch (e) {
                console.error('Review task failed:', e);
                showToast('Failed to create task: ' + e.message, 'error');
                btn.classList.remove('active');
                btn.disabled = false;
                return;
            }

            setTimeout(function() {
                btn.classList.remove('active');
                btn.disabled = false;
            }, 2000);
            return;

        } else if (command === 'explain') {
            message = '/explain';
            btn = document.getElementById('btnExplain');
            activeWorkflowCommand = 'explain';
        } else if (command === 'implement') {
            message = 'Proceed with implementation';
            btn = document.getElementById('btnImplement');
            activeWorkflowCommand = 'implement';
        }

        if (btn) {
            btn.classList.add('active');
            btn.disabled = true;
        }

        try {
            await sendMessageDirect(message, [], [], project);
        } catch (e) {
            console.error('Workflow command failed:', e);
            showToast('Command failed: ' + e.message, 'error');
        } finally {
            if (btn) {
                setTimeout(function() {
                    btn.classList.remove('active');
                    btn.disabled = false;
                }, 2000);
            }
        }
    }
    window.runWorkflowCommand = runWorkflowCommand;

    // ========== CHAT HISTORY ==========
    async function loadChatHistory(project, showLatest) {
        selectedHistoryIndex = -1;
        // Reset screenCleared when loading history for a project -
        // user expects to see history when switching projects
        if (screenCleared) {
            screenCleared = false;
            localStorage.removeItem('screenCleared');
        }
        if (!project) {
            chatHistory = [];
            renderChatHistory();
            return;
        }
        try {
            var res = await fetch('/api/history/' + encodeURIComponent(project));
            var data = await res.json();
            chatHistory = data.history || [];
            if (showLatest && chatHistory.length > 0) {
                selectedHistoryIndex = chatHistory.length - 1;
            }
            renderChatHistory();

            // Check for active jobs and reconnect if found
            checkAndReconnectActiveJob(project);
        } catch (e) {
            console.log('Failed to load history:', e);
            chatHistory = [];
            renderChatHistory();
        }
    }

    // Check for active jobs on this project and reconnect to streaming
    async function checkAndReconnectActiveJob(project) {
        if (!project) return;

        try {
            var res = await fetch('/api/active/' + encodeURIComponent(project));
            var data = await res.json();

            if (data.active && data.job) {
                var job = data.job;
                console.log('Found active job:', job.id, 'status:', job.status);

                // Reconnect to this job
                currentJobId = job.id;
                pendingUserMessage = job.message || '';

                // Show the live box with current state
                startStreaming();
                showLiveBox(job.activity || 'Processing...');

                // If there's existing stream content, display it
                if (job.stream) {
                    var jsonLines = job.stream.split('\n').filter(function(l) { return l.trim(); });
                    var activity = 'Processing...';
                    var contentParts = [];

                    jsonLines.forEach(function(line) {
                        try {
                            var obj = JSON.parse(line);
                            if (obj.type === 'assistant' && obj.message && obj.message.content) {
                                obj.message.content.forEach(function(c) {
                                    if (c.type === 'text' && c.text) {
                                        contentParts.push(c.text);
                                    }
                                });
                            }
                            // Update activity from various message types
                            if (obj.type === 'system' && obj.message) {
                                activity = obj.message.substring(0, 100);
                            }
                        } catch (e) {
                            // Skip non-JSON lines
                        }
                    });

                    var currentContent = contentParts.join('');
                    if (currentContent) {
                        currentStreamText = currentContent;
                        var cleanedText = cleanLiveText(currentContent);
                        if (cleanedText) {
                            updateLiveBox(cleanedText, activity);
                        }
                    }
                }

                // Start polling for updates
                pollJobStatus();
                showToast('Reconnected to active job', 'success');
            }
        } catch (e) {
            console.log('Failed to check for active jobs:', e);
        }
    }

    async function saveChatEntry(project, userMsg, aiResponse) {
        if (!project) return;
        try {
            await fetch('/api/history/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    project: project,
                    user: userMsg,
                    assistant: stripAnsi(aiResponse),
                    timestamp: Date.now() / 1000
                })
            });
        } catch (e) {
            console.log('Failed to save history:', e);
        }
    }

    function stripAnsi(text) {
        text = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        text = text.replace(/\x1b\][^\x07]*\x07/g, '');
        text = text.replace(/\x1b\][^\x1b]*\x1b\\/g, '');
        text = text.replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '');
        text = text.replace(/\x1b[\x40-\x5F]/g, '');
        text = text.replace(/\x1b./g, '');
        text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        text = text.replace(/\x1b\[?[0-9;]*$/g, '');
        text = text.replace(/<[a-z]$/g, '');
        return text.trim();
    }

    function escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderHistorySidebar() {
        var historyList = document.getElementById('historyList');
        var historyCount = document.getElementById('historyCount');

        if (chatHistory.length === 0) {
            historyList.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:20px;">' +
                (savedProject ? 'No messages yet' : 'Select a project') + '</div>';
            historyCount.textContent = '';
            updateDeleteButton();
            return;
        }

        var html = '';
        for (var i = chatHistory.length - 1; i >= 0; i--) {
            var entry = chatHistory[i];
            var dt = new Date(entry.timestamp * 1000);
            var timeStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            var preview = entry.user.substring(0, 50) + (entry.user.length > 50 ? '...' : '');
            var selected = (i === selectedHistoryIndex) ? ' selected' : '';
            var checked = selectedForDeletion.has(i) ? ' checked' : '';
            html += '<div class="history-item' + selected + '" data-index="' + i + '">' +
                '<div class="history-item-row">' +
                    '<input type="checkbox" class="history-checkbox"' + checked + ' onclick="toggleHistoryCheckbox(event, ' + i + ')" title="Select for deletion">' +
                    '<div class="history-content" onclick="selectHistoryItem(' + i + ')">' +
                        '<div class="history-item-time">' + timeStr + '</div>' +
                        '<div class="history-item-preview">' + escapeHtml(preview) + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
        historyList.innerHTML = html;
        historyCount.textContent = chatHistory.length + ' message' + (chatHistory.length === 1 ? '' : 's');
        updateDeleteButton();
    }

    function renderChatHistory() {
        // Don't overwrite responseArea while actively streaming
        if (isStreaming) return;

        // If screen was cleared, show blank state
        if (screenCleared) {
            responseArea.innerHTML = '';
            renderHistorySidebar();
            return;
        }

        if (chatHistory.length === 0) {
            responseArea.innerHTML = '';
            renderHistorySidebar();
            return;
        }

        if (selectedHistoryIndex >= 0 && selectedHistoryIndex < chatHistory.length) {
            var entry = chatHistory[selectedHistoryIndex];
            var dt = new Date(entry.timestamp * 1000);
            var timeStr = dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            var dateStr = dt.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + timeStr;
            var html = '<div style="margin-bottom:12px;">' +
                '<button class="btn" onclick="showAllHistory()">&larr; Back to all</button>' +
                '</div>' +
                '<div class="message-entry">' +
                '<div class="message-header"><span class="message-time">' + dateStr + '</span></div>' +
                '<div class="message-user"><strong>You:</strong> ' + escapeHtml(entry.user) + '</div>' +
                '<div class="message-assistant"><strong>Axion:</strong><br>' + renderMarkdown(entry.assistant) + '</div>' +
                '</div>';
            responseArea.innerHTML = html;
        } else {
            var html = chatHistory.map(function(entry, idx) {
                var dt = new Date(entry.timestamp * 1000);
                var timeStr = dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                var dateStr = dt.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + timeStr;
                return '<div class="message-entry" style="cursor:pointer;" onclick="selectHistoryItem(' + idx + ')">' +
                    '<div class="message-header"><span class="message-time">' + dateStr + '</span></div>' +
                    '<div class="message-user"><strong>You:</strong> ' + escapeHtml(entry.user) + '</div>' +
                    '<div class="message-assistant"><strong>Axion:</strong><br>' + renderMarkdown(entry.assistant) + '</div>' +
                '</div>';
            }).join('');
            responseArea.innerHTML = html;
        }
        responsePane.scrollTop = responsePane.scrollHeight;
        renderHistorySidebar();
        addCopyButtons();
    }

    function selectHistoryItem(index) {
        selectedHistoryIndex = index;
        // Reset screenCleared so the selected item actually displays
        if (screenCleared) {
            screenCleared = false;
            localStorage.removeItem('screenCleared');
        }
        renderHistorySidebar();
        renderChatHistory();
    }
    window.selectHistoryItem = selectHistoryItem;

    function showAllHistory() {
        selectedHistoryIndex = -1;
        // Reset screenCleared so history list actually displays
        if (screenCleared) {
            screenCleared = false;
            localStorage.removeItem('screenCleared');
        }
        renderChatHistory();
    }
    window.showAllHistory = showAllHistory;

    function toggleHistoryCheckbox(event, index) {
        event.stopPropagation();
        if (selectedForDeletion.has(index)) {
            selectedForDeletion.delete(index);
        } else {
            selectedForDeletion.add(index);
        }
        updateDeleteButton();
    }
    window.toggleHistoryCheckbox = toggleHistoryCheckbox;

    function updateDeleteButton() {
        var btn = document.getElementById('deleteSelectedBtn');
        var countSpan = document.getElementById('selectedCount');
        var count = selectedForDeletion.size;
        countSpan.textContent = count;
        if (count > 0) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    }

    async function deleteSelectedHistory() {
        if (!savedProject) {
            showToast('No project selected', 'error');
            return;
        }
        if (selectedForDeletion.size === 0) {
            showToast('No items selected', 'error');
            return;
        }
        var count = selectedForDeletion.size;
        try {
            var indices = Array.from(selectedForDeletion);
            await fetch('/api/history/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: savedProject, indices: indices })
            });
            indices.sort(function(a, b) { return b - a; });
            indices.forEach(function(idx) {
                chatHistory.splice(idx, 1);
            });
            selectedForDeletion.clear();
            selectedHistoryIndex = -1;
            renderChatHistory();
            showToast(count + ' item' + (count > 1 ? 's' : '') + ' deleted', 'success');
        } catch (e) {
            console.log('Failed to delete history:', e);
            showToast('Failed to delete history', 'error');
        }
    }
    window.deleteSelectedHistory = deleteSelectedHistory;

    async function clearHistory() {
        if (!savedProject) {
            showToast('No project selected', 'error');
            return;
        }
        if (!confirm('Clear all conversation history for "' + savedProject + '"? This cannot be undone.')) {
            return;
        }
        try {
            await fetch('/api/history/clear', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: savedProject })
            });
            chatHistory = [];
            selectedHistoryIndex = -1;
            renderChatHistory();
            showToast('History cleared', 'success');
        } catch (e) {
            console.log('Failed to clear history:', e);
            showToast('Failed to clear history', 'error');
        }
    }
    window.clearHistory = clearHistory;

    // ========== SIDEBAR & FULLSCREEN ==========
    function toggleHistorySidebar() {
        var sidebar = document.getElementById('historySidebar');
        var toggleBtn = document.getElementById('sidebarToggle');
        sidebarCollapsed = !sidebarCollapsed;
        localStorage.setItem('chatRelaySidebarCollapsed', sidebarCollapsed);
        if (sidebarCollapsed) {
            sidebar.classList.add('collapsed');
            sidebar.classList.remove('mobile-open');
            toggleBtn.style.display = 'inline-block';
        } else {
            sidebar.classList.remove('collapsed');
            sidebar.classList.add('mobile-open');
            toggleBtn.style.display = 'none';
        }
    }
    window.toggleHistorySidebar = toggleHistorySidebar;

    function initSidebar() {
        if (sidebarCollapsed) {
            document.getElementById('historySidebar').classList.add('collapsed');
            document.getElementById('sidebarToggle').style.display = 'inline-block';
        }
    }

    function toggleFullscreen() {
        if (isBrettFullscreen) {
            toggleBrettFullscreen();
            return;
        }
        isFullscreen = !isFullscreen;
        var main = document.querySelector('.main');
        if (isFullscreen) {
            main.classList.add('fullscreen-mode');
        } else {
            main.classList.remove('fullscreen-mode');
        }
    }
    window.toggleFullscreen = toggleFullscreen;

    function toggleBrettFullscreen(event) {
        if (event && (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT')) {
            return;
        }
        if (isFullscreen) {
            toggleFullscreen();
            return;
        }
        isBrettFullscreen = !isBrettFullscreen;
        var main = document.querySelector('.main');
        if (isBrettFullscreen) {
            main.classList.add('fullscreen-brett');
        } else {
            main.classList.remove('fullscreen-brett');
        }
    }
    window.toggleBrettFullscreen = toggleBrettFullscreen;

    // ========== MARKDOWN RENDERING WITH SYNTAX HIGHLIGHTING ==========
    function renderMarkdown(text) {
        if (!text) return '';

        // VERY FIRST: Protect raw HTML blocks (e.g., mockup gallery) BEFORE any processing
        var rawHtmlBlocks = [];
        text = text.replace(/<!--MOCKUP_START-->([\s\S]*?)<!--MOCKUP_END-->/g, function(match) {
            rawHtmlBlocks.push(match.replace('<!--MOCKUP_START-->', '').replace('<!--MOCKUP_END-->', ''));
            return '[[RAW_HTML_' + (rawHtmlBlocks.length - 1) + ']]';
        });

        // Handle raw HTML img tags - convert to markdown with /screenshots/ path
        text = text.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, function(match, src) {
            var filename = src.split('/').pop();
            // Always use /screenshots/ path
            return '![' + filename + '](/screenshots/' + filename + ')';
        });

        // Convert screenshot paths to markdown images (various formats Claude might use)
        // 1. Full absolute paths to any project's screenshots
        text = text.replace(/[`"']?\/opt\/clawd\/projects\/[^\/]+\/(?:\.?screenshots|tests\/screenshots)\/([^\s\n`"']+\.(png|jpg|jpeg|gif|webp))[`"']?/gi, function(match, filename) {
            return '![' + filename + '](/screenshots/' + filename + ')';
        });
        // 2. Relative .screenshots/ paths
        text = text.replace(/[`"']?\.screenshots\/([^\s\n`"']+\.(png|jpg|jpeg|gif|webp))[`"']?/gi, function(match, filename) {
            return '![' + filename + '](/screenshots/' + filename + ')';
        });
        // 3. Relative tests/screenshots/ paths (common in test projects)
        text = text.replace(/[`"']?tests\/screenshots\/([^\s\n`"']+\.(png|jpg|jpeg|gif|webp))[`"']?/gi, function(match, filename) {
            return '![' + filename + '](/screenshots/' + filename + ')';
        });
        // 4. "Screenshot saved/captured to/at: path" pattern - handles various phrasings
        text = text.replace(/Screenshot[s]?\s*(?:saved|captured|taken)?\s*(?:to|at)?[:\s]+[`"']?([^\s\n`"']+\.(png|jpg|jpeg|gif|webp))[`"']?/gi, function(match, filepath) {
            var name = filepath.split('/').pop();
            return '**Screenshot:** ![' + name + '](/screenshots/' + name + ')';
        });

        // 5. Auto-detect ANY image filename and convert to markdown image
        // Matches: 01-login-page.png, screenshot_1.png, test-result.jpg, e2e-test.png
        var imagePattern = /\b([a-zA-Z0-9][a-zA-Z0-9_-]*\.(png|jpg|jpeg|gif|webp))\b/gi;
        var imageMatches = text.match(imagePattern) || [];
        var convertedFiles = new Set();

        imageMatches.forEach(function(filename) {
            // Skip if already converted to markdown image
            if (text.indexOf('](/screenshots/' + filename + ')') === -1 &&
                text.indexOf('![' + filename + ']') === -1) {
                convertedFiles.add(filename);
            }
        });

        // Replace unconverted filenames
        convertedFiles.forEach(function(filename) {
            var escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Replace backtick-wrapped
            text = text.replace(new RegExp('`' + escaped + '`', 'gi'), '![' + filename + '](/screenshots/' + filename + ')');
            // Replace quoted
            text = text.replace(new RegExp('"' + escaped + '"', 'gi'), '![' + filename + '](/screenshots/' + filename + ')');
            text = text.replace(new RegExp("'" + escaped + "'", 'gi'), '![' + filename + '](/screenshots/' + filename + ')');
        });


        // Handle code blocks with syntax highlighting - protect them from later escaping
        var codeBlocks = [];
        text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
            lang = lang || 'plaintext';
            var highlighted = code.trim();
            try {
                if (typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
                    highlighted = hljs.highlight(code.trim(), {language: lang}).value;
                } else {
                    highlighted = escapeHtml(code.trim());
                }
            } catch (e) {
                highlighted = escapeHtml(code.trim());
            }
            codeBlocks.push('<pre><code class="hljs language-' + lang + '">' + highlighted + '</code></pre>');
            return '[[CODE_BLOCK_' + (codeBlocks.length - 1) + ']]';
        });

        // Protect inline code before escaping
        var inlineCodeBlocks = [];
        text = text.replace(/`([^`]+)`/g, function(match, code) {
            inlineCodeBlocks.push('<code>' + escapeHtml(code) + '</code>');
            return '[[INLINE_CODE_' + (inlineCodeBlocks.length - 1) + ']]';
        });

        // Protect images (use array to avoid separator issues with URLs containing colons)
        var protectedImages = [];
        text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(match, alt, src) {
            protectedImages.push({alt: alt, src: src});
            return '[[IMG_' + (protectedImages.length - 1) + ']]';
        });

        // Protect links (use array to avoid separator issues with URLs containing colons)
        var protectedLinks = [];
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, linkText, url) {
            protectedLinks.push({text: linkText, url: url});
            return '[[LINK_' + (protectedLinks.length - 1) + ']]';
        });

        // Escape HTML
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Restore protected images - ensure all images use /screenshots/ path
        text = text.replace(/\[\[IMG_(\d+)\]\]/g, function(match, idx) {
            var img = protectedImages[parseInt(idx)];
            if (!img) return match;
            var finalSrc = img.src;
            if (!finalSrc.startsWith('/screenshots/') && !finalSrc.startsWith('http://') && !finalSrc.startsWith('https://')) {
                // Extract just the filename
                var filename = finalSrc.split('/').pop();
                finalSrc = '/screenshots/' + filename;
            }
            return '<img src="' + finalSrc + '" alt="' + img.alt + '" style="max-width:100%;border:1px solid var(--border);border-radius:8px;margin:12px 0;cursor:pointer;display:block;" onclick="openLightbox(this.src)" title="Click to view: ' + img.alt + '">';
        });
        // Restore protected links
        text = text.replace(/\[\[LINK_(\d+)\]\]/g, function(match, idx) {
            var link = protectedLinks[parseInt(idx)];
            if (!link) return match;
            if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
                return '<a href="' + link.url + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;" title="' + link.url + '">' + link.text + '</a>';
            }
            return '<a href="#" onclick="openFileOrLink(\'' + link.url + '\'); return false;" style="color:var(--accent);text-decoration:underline;cursor:pointer;" title="Open: ' + link.url + '">' + link.text + '</a>';
        });

        // Restore code blocks
        text = text.replace(/\[\[CODE_BLOCK_(\d+)\]\]/g, function(match, idx) {
            return codeBlocks[parseInt(idx)];
        });

        // Restore inline code
        text = text.replace(/\[\[INLINE_CODE_(\d+)\]\]/g, function(match, idx) {
            return inlineCodeBlocks[parseInt(idx)];
        });

        // Restore raw HTML blocks (mockup gallery etc.)
        text = text.replace(/\[\[RAW_HTML_(\d+)\]\]/g, function(match, idx) {
            return rawHtmlBlocks[parseInt(idx)];
        });

        // Auto-link bare URLs (not already inside tags or markdown links)
        text = text.replace(/(?<![="'>])(https?:\/\/[^\s<>"')\]]+)/g, function(match, url) {
            // Don't double-link URLs already inside <a> tags
            return '<a href="' + url + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">' + url + '</a>';
        });

        // Headers
        text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold and italic
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Lists
        text = text.replace(/^- (.+)$/gm, '<li>$1</li>');

        // Newlines
        text = text.replace(/\n/g, '<br>');

        return text;
    }

    // ========== COPY CODE BUTTONS ==========
    function addCopyButtons() {
        document.querySelectorAll('pre code').forEach(function(block) {
            if (block.parentNode.querySelector('.copy-btn')) return;

            var btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.textContent = 'Copy';
            btn.title = 'Copy code';
            btn.onclick = function(e) {
                e.stopPropagation();
                navigator.clipboard.writeText(block.textContent).then(function() {
                    btn.textContent = 'Copied!';
                    setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
                });
            };
            block.parentNode.appendChild(btn);
        });
    }
    window.renderMarkdown = renderMarkdown;

    // ========== AGENT MODE SYSTEM (Auto-Detection) ==========
    // Agent mode is now automatically detected from message content
    // Users can still type @prefix manually if they want to override

    var agentModeDescriptions = {
        '@explore': 'Explore',
        '@research': 'Research',
        '@plan': 'Plan',
        '@architect': 'Architect',
        '@dev': 'Development',
        '@implement': 'Implement',
        '@review': 'Review',
        '@debug': 'Debug',
        '@test': 'Test',
        '@quick': 'Quick',
        '@fix': 'Fix'
    };

    function detectAgentMode(text) {
        // Check for explicit @prefix at start of message
        var prefixMatch = text.match(/^(@\w+)\s/);
        if (prefixMatch) {
            var prefix = prefixMatch[1].toLowerCase();
            if (agentModeDescriptions[prefix]) {
                return prefix;
            }
        }

        var lowerText = text.toLowerCase();

        // Debug patterns - high priority for error-related queries
        if (/\b(bug|error|fix|broken|not working|issue|debug|failing|crash|wrong|exception|stack trace|traceback)\b/.test(lowerText)) {
            return '@debug';
        }

        // Research/Explore patterns - questions and discovery
        if (/^(where|what|how does|how is|which|find|search|show me|list|explore|look for|locate)\b/.test(lowerText)) {
            return '@explore';
        }
        if (/\b(understand|investigate|research|deep dive|explain codebase|tell me about)\b/.test(lowerText)) {
            return '@research';
        }

        // Plan/Design patterns
        if (/\b(plan|design|architect|approach|how should|structure|organize|layout)\b/.test(lowerText)) {
            return '@plan';
        }
        if (/\b(architecture|system design|high level|blueprint)\b/.test(lowerText)) {
            return '@architect';
        }

        // Review patterns
        if (/\b(review|check|audit|look at|examine|assess|evaluate|critique)\b/.test(lowerText)) {
            return '@review';
        }

        // Test patterns
        if (/\b(test|spec|coverage|verify|unit test|integration test|e2e)\b/.test(lowerText)) {
            return '@test';
        }

        // Development/Implementation patterns
        if (/\b(implement|add|create|build|make|write|develop|code)\b/.test(lowerText)) {
            // If combined with planning words, use @plan instead
            if (/\b(feature|page|component|system|module|service)\b/.test(lowerText)) {
                // Check if it's more of a "do it now" request
                if (/\b(now|quickly|just|please)\b/.test(lowerText)) {
                    return '@dev';
                }
                return '@plan';
            }
            return '@dev';
        }

        // Quick patterns - simple requests
        if (/\b(quick|simple|small|just|only|minor)\b/.test(lowerText)) {
            return '@quick';
        }

        // Default: no mode (let Claude decide)
        return '';
    }

    function prepareMessageWithAgentContext(text) {
        var mode = detectAgentMode(text);

        // If no mode detected, return original text
        if (!mode) return text;

        // Build context based on mode
        var context = '';
        switch (mode) {
            case '@explore':
                context = '[AGENT MODE: Explore] Use the Task tool with subagent_type="Explore" to find relevant files and patterns. Focus on quick discovery.\n\n';
                break;
            case '@research':
                context = '[AGENT MODE: Research] Use the Task tool with subagent_type="general-purpose" for deep research. Explore multiple angles and gather comprehensive information.\n\n';
                break;
            case '@plan':
                context = '[AGENT MODE: Plan] Use the Task tool with subagent_type="Plan" to design an implementation approach. Consider architecture, file changes, and trade-offs.\n\n';
                break;
            case '@architect':
                context = '[AGENT MODE: Architect] Use the Task tool with subagent_type="Plan" for architecture decisions. Focus on system design and integration points.\n\n';
                break;
            case '@dev':
                context = '[AGENT MODE: Development] Full development mode. First use Explore agents to understand the codebase, then Plan agents to design the approach, then implement.\n\n';
                break;
            case '@implement':
                context = '[AGENT MODE: Implement] Skip to implementation. Assume planning is done. Focus on writing code efficiently.\n\n';
                break;
            case '@review':
                context = '[AGENT MODE: Review] Use the Task tool with subagent_type="general-purpose" to perform code review. Check for bugs, security issues, and improvements.\n\n';
                break;
            case '@debug':
                context = '[AGENT MODE: Debug] Use debug-trace approach. Trace data flow, find root causes. Use Explore agents to locate relevant code.\n\n';
                break;
            case '@test':
                context = '[AGENT MODE: Test] Focus on testing. Write tests, run existing tests, verify behavior.\n\n';
                break;
            case '@quick':
                context = '[AGENT MODE: Quick] Simple task - use haiku model if available for speed. Quick lookup or small change.\n\n';
                break;
            case '@fix':
                context = '[AGENT MODE: Fix] Bug fix mode. Identify the issue, find root cause, implement fix, verify.\n\n';
                break;
        }

        // Remove prefix from text if present (user typed @prefix manually)
        var cleanText = text.replace(/^@\w+\s*/i, '');

        return context + cleanText;
    }

    // ========== MESSAGE SENDING ==========
    async function sendMessage() {
        var text = inputArea.value.trim();
        if (!text && attachedImages.length === 0 && attachedFiles.length === 0) {
            showToast('Enter a message or attach an image', 'error');
            return;
        }

        // Apply agent mode context to message (auto-detected from content)
        // Skip detection if text was just formatted - send as plain text
        var processedText = textWasFormatted ? text : prepareMessageWithAgentContext(text);
        textWasFormatted = false;  // Reset flag after use

        // Stop voice recording when sending to prevent picking up Axion's response
        // Track if voice was on so we can restore it when task completes
        if (isRecording) {
            wasRecordingBeforeTask = true;
            isRecording = false;
            recognition.stop();
            voiceBtn.classList.remove('recording');
            voiceBtn.textContent = '🎤';
            voiceDots.classList.remove('active');
        }

        var project = document.getElementById('projectSelect').value;
        var imagesToSend = attachedImages.slice();
        var filesToSend = attachedFiles.slice();

        inputArea.value = '';
        attachedImages = [];
        attachedFiles = [];
        renderAttachments();

        // Use processed text with agent context
        text = processedText;

        // If a job is already running, add to queue instead
        if (currentJobId) {
            addToQueue(text, imagesToSend, filesToSend, project);
            return;
        }

        startStreaming(); // New content at top, scroll there
        await sendMessageDirect(text, imagesToSend, filesToSend, project);
    }
    window.sendMessage = sendMessage;

    async function sendMessageDirect(text, images, files, project) {
        var model = 'opus';
        pendingUserMessage = text;
        statusEl.textContent = 'Sending...';

        showAckBanner('Sending message to server...', false);

        // Show loading state in the LIVE BOX
        startStreaming();
        var loadingHtml = '<div class="message-user"><strong>You:</strong> ' + escapeHtml(text) + '</div>' +
            '<div class="message-assistant"><strong>Axion:</strong> <div style="color:var(--text-secondary);">Sending to Claude...</div></div>';
        updateLiveBox(loadingHtml, 'Sending...');

        // Only render existing history if screen wasn't cleared
        if (!screenCleared) {
            renderChatHistory();
        }
        renderQueuePanel();

        try {
            var payload = {
                message: text,
                model: model,
                project: project,
                images: images || [],
                files: files || [],
                personality: currentPersonality || 'neutral',
                customPrompt: getActivePersonalityPrompt(currentPersonality || 'neutral')
            };
            var res = await fetch('/api/chat/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var data = await res.json();

            if (data.job_id) {
                saveJobState(data.job_id, project, text);
                showAckBanner('Message queued (Job: ' + data.job_id + ') - Waiting for Claude...', true);
                renderQueuePanel();
                startPolling(data.job_id, project);
            } else {
                throw new Error(data.error || 'Failed to start job');
            }
        } catch (err) {
            hideAckBanner();
            onJobComplete();
            hideLiveBox();
            updateLiveBox('<span style="color:var(--error)">Error: ' + err.message + '</span>', 'Error');
            showLiveBox('Error');
            statusEl.textContent = 'Error';
        }
    }

    function startPolling(jobId, project) {
        var dots = 0;
        var startTime = Date.now();

        pollInterval = setInterval(async function() {
            dots = (dots + 1) % 4;
            var elapsed = Math.floor((Date.now() - startTime) / 1000);

            try {
                var res = await fetch('/api/chat/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ job_id: jobId })
                });
                var data = await res.json();

                if (data.status === 'waiting_for_answers') {
                    statusEl.textContent = 'Claude needs your input...';
                    // Only show modal if not already visible (avoid resetting user's selections)
                    var modal = document.getElementById('questionsModal');
                    if (!modal.classList.contains('visible')) {
                        showAckBanner('Claude has questions for you!', true);
                        showQuestionsModal(data.questions || [], data.response_so_far || '');
                    }
                } else if (data.status === 'complete') {
                    clearInterval(pollInterval);
                    var result = data.result || 'No response';

                    // Add screenshots gallery if any were captured
                    if (data.screenshots && data.screenshots.length > 0) {
                        var isMockup = data.screenshots.some(function(s) { return s.name.indexOf('mockup') !== -1; });

                        if (isMockup) {
                            // Mockup comparison grid with labels and preview buttons
                            var mockupScreenshots = data.screenshots.filter(function(s) { return s.name.indexOf('mockup') !== -1; });
                            var otherScreenshots = data.screenshots.filter(function(s) { return s.name.indexOf('mockup') === -1; });

                            var screenshotGallery = '\n\n<!--MOCKUP_START--><div class="mockup-gallery">';
                            screenshotGallery += '<div class="mockup-gallery-header">Design Mockups</div>';
                            screenshotGallery += '<div class="mockup-grid">';

                            mockupScreenshots.forEach(function(img) {
                                var label = 'Mockup';
                                if (img.name.indexOf('_final') !== -1) label = 'Final Design';
                                else if (img.name.indexOf('_a') !== -1) label = 'Variation A';
                                else if (img.name.indexOf('_b') !== -1) label = 'Variation B';
                                else if (img.name.indexOf('_c') !== -1) label = 'Variation C';
                                else if (img.name.indexOf('_reference') !== -1) label = 'Reference';

                                // Derive HTML preview URL from screenshot name
                                var htmlFile = img.name.replace('.png', '.html').replace('.jpg', '.html');
                                var previewUrl = '/mockups/' + htmlFile;

                                screenshotGallery += '<div class="mockup-card' + (label === 'Final Design' ? ' mockup-final' : '') + '">';
                                screenshotGallery += '<div class="mockup-label">' + label + '</div>';
                                screenshotGallery += '<img src="' + img.url + '" onclick="openLightbox(\'' + img.url + '\')" title="Click to enlarge">';
                                if (label !== 'Reference') {
                                    screenshotGallery += '<button class="mockup-preview-btn" onclick="openMockupPreview(\'' + previewUrl + '\', \'' + label + '\')" title="Interactive preview">Preview</button>';
                                }
                                screenshotGallery += '</div>';
                            });

                            screenshotGallery += '</div></div><!--MOCKUP_END-->\n\n';

                            // Add any non-mockup screenshots normally
                            if (otherScreenshots.length > 0) {
                                screenshotGallery += '📸 **Other screenshots (' + otherScreenshots.length + '):**\n\n';
                                otherScreenshots.forEach(function(img) {
                                    screenshotGallery += '![' + img.name + '](' + img.url + ')\n';
                                });
                            }

                            screenshotGallery += '\n---\n\n';
                            result = screenshotGallery + result;
                        } else {
                            // Standard screenshot gallery
                            var screenshotGallery = '\n\n📸 **Screenshots captured (' + data.screenshots.length + '):**\n\n';
                            data.screenshots.forEach(function(img) {
                                screenshotGallery += '![' + img.name + '](' + img.url + ')\n';
                            });
                            screenshotGallery += '\n---\n\n';
                            result = screenshotGallery + result;
                        }
                    }

                    var entry = {
                        user: pendingUserMessage,
                        assistant: result,
                        timestamp: Date.now() / 1000
                    };
                    chatHistory.push(entry);
                    saveChatEntry(project, pendingUserMessage, result);

                    selectedHistoryIndex = chatHistory.length - 1;

                    // Reset screenCleared flag since we now have new history
                    screenCleared = false;
                    localStorage.removeItem('screenCleared');

                    // Mark live box as complete then hide after brief delay
                    // Use tracked timer so it can be cancelled if new job starts
                    completeLiveBox();
                    hideLiveBoxTimer = setTimeout(function() {
                        hideLiveBox();
                        renderChatHistory();
                        hideLiveBoxTimer = null;
                    }, 1000);

                    statusEl.textContent = 'Complete';

                    // Clear streaming speech queue when task completes
                    cancelAllSpeech();
                    speakQueue = [];
                    isSpeaking = false;
                    clearHighlight();

                    // Get task title before clearing state
                    var taskTitle = onJobComplete();

                    // Just announce completion - don't re-read the entire response
                    // (content was already read during streaming if auto-read was on)
                    speak(taskTitle + ' completed', 'axion');

                    await handleWorkflowCompletion(project);
                    adjustPolling();
                } else if (data.status === 'error') {
                    clearInterval(pollInterval);
                    hideLiveBox();
                    renderChatHistory();
                    // Show error in live box briefly
                    updateLiveBox('<div style="color:var(--error);">Error: ' + (data.error || 'Unknown error') + '</div>', 'Error');
                    showLiveBox('Error');
                    statusEl.textContent = 'Error';
                    onJobComplete();
                } else {
                    var activityText = data.activity || ('Thinking' + '.'.repeat(dots));
                    statusEl.textContent = activityText + ' (' + elapsed + 's)';
                    showAckBanner(activityText + ' (' + elapsed + 's)', true);

                    if (data.stream && data.stream.length > 0) {
                        var streamText = parseStreamJson(data.stream);

                        // Show ONLY the new chunk in the live box, previous content moves below
                        updateLiveBoxWithChunk(streamText, pendingUserMessage, activityText + ' (' + elapsed + 's)');
                        addCopyButtons();
                        // Auto-read is handled inside updateLiveBoxWithChunk
                    } else {
                        // Still waiting for content - show thinking indicator in live box
                        updateLiveBox(
                            '<div class="live-chunk" style="color:var(--text-secondary);"><span class="thinking">Thinking' + '.'.repeat(dots) + '</span></div>',
                            activityText + ' (' + elapsed + 's)'
                        );
                    }
                }
            } catch (err) {
                // Keep polling on network errors
            }
        }, pollConfig.jobStatusInterval);
    }

    function parseStreamJson(stream) {
        if (!stream) return '';
        var textParts = [];
        var lines = stream.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            try {
                var obj = JSON.parse(line);
                if (obj.type === 'assistant' && obj.message && obj.message.content) {
                    var content = obj.message.content;
                    for (var j = 0; j < content.length; j++) {
                        if (content[j].type === 'text') {
                            textParts.push(content[j].text);
                        } else if (content[j].type === 'tool_use') {
                            var tool = content[j].name;
                            var input = content[j].input || {};
                            if (tool === 'Read' && input.file_path) {
                                textParts.push('Reading: ' + input.file_path.split('/').pop());
                            } else if (tool === 'Edit' && input.file_path) {
                                textParts.push('Editing: ' + input.file_path.split('/').pop());
                            } else if (tool === 'Bash' && input.command) {
                                textParts.push('Running: ' + input.command.substring(0, 60) + (input.command.length > 60 ? '...' : ''));
                            } else if (tool === 'Grep' && input.pattern) {
                                textParts.push('Searching: ' + input.pattern);
                            } else {
                                textParts.push('Using ' + tool + '...');
                            }
                        }
                    }
                } else if (obj.type === 'result' && obj.result) {
                    textParts.push(obj.result);
                }
            } catch (e) {
                if (line.length > 0 && !line.startsWith('{')) {
                    textParts.push(line);
                }
            }
        }
        return textParts.join('\n');
    }

    // ========== WORKFLOW COMPLETION ==========
    async function handleWorkflowCompletion(project) {
        if (!activeWorkflowCommand) return;

        var command = activeWorkflowCommand;
        activeWorkflowCommand = null;

        if (command === 'reviewtask') {
            await loadWorkflowFile(project, 'task');
            var btn = document.getElementById('btnReviewTask');
            btn.classList.remove('active');
            btn.classList.add('complete');
            btn.disabled = false;
            showToast('TASK.md updated - Click Explain to analyze', 'success');
        } else if (command === 'explain') {
            await loadWorkflowFile(project, 'output');
            var btn = document.getElementById('btnExplain');
            btn.classList.remove('active');
            btn.classList.add('complete');
            btn.disabled = false;
            showToast('Plan ready in OUTPUT.md - Review and click Implement', 'success');
        } else if (command === 'implement') {
            var btn = document.getElementById('btnImplement');
            btn.classList.remove('active');
            btn.classList.add('complete');
            btn.disabled = false;
            showToast('Implementation complete!', 'success');
            setTimeout(function() {
                document.getElementById('btnReviewTask').classList.remove('complete');
                document.getElementById('btnExplain').classList.remove('complete');
                document.getElementById('btnImplement').classList.remove('complete');
            }, 5000);
        }
    }

    async function loadWorkflowFile(project, fileType) {
        if (!project) return;

        try {
            var res = await fetch('/api/task/load', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (data.success) {
                // TASK.md goes into Brett text area for editing
                if (fileType === 'task' && data.task) {
                    inputArea.value = data.task;
                    updateLineNumbers();
                    showToast('TASK.md loaded in Brett - edit and review', 'success');
                }

                // OUTPUT.md goes into AXION panel for viewing
                if ((fileType === 'output' || fileType === 'both') && data.output) {
                    var workflowHtml = '<div class="message-entry workflow-file">' +
                        '<div class="message-header"><span class="message-time">OUTPUT.md</span></div>' +
                        '<div class="message-assistant">' + renderMarkdown(data.output) + '</div>' +
                    '</div>';
                    responseArea.innerHTML = responseArea.innerHTML + workflowHtml;
                    responsePane.scrollTop = responsePane.scrollHeight;
                    addCopyButtons();
                }

                // Both mode: task to Brett, output to AXION
                if (fileType === 'both' && data.task) {
                    inputArea.value = data.task;
                    updateLineNumbers();
                }
            }
        } catch (e) {
            console.log('Failed to load workflow file:', e);
        }
    }

    // ========== MESSAGE QUEUE ==========
    function renderQueuePanel() {
        var panel = document.getElementById('queuePanel');
        var list = document.getElementById('queueList');
        var countEl = document.getElementById('queueCount');

        if (messageQueue.length === 0 && !currentJobId) {
            panel.classList.remove('visible');
            return;
        }

        panel.classList.add('visible');
        countEl.textContent = messageQueue.length + (currentJobId ? ' + 1 processing' : '');

        var html = '';

        if (currentJobId) {
            html += '<div class="queue-item processing">' +
                '<div class="queue-item-number">&rtrif;</div>' +
                '<div class="queue-item-text">' + escapeHtml(pendingUserMessage || 'Processing...') + '</div>' +
                '<div class="queue-item-status">Processing</div>' +
            '</div>';
        }

        messageQueue.forEach(function(item, idx) {
            html += '<div class="queue-item pending">' +
                '<div class="queue-item-number">' + (idx + 1) + '</div>' +
                '<div class="queue-item-text">' + escapeHtml(item.message.substring(0, 60)) + (item.message.length > 60 ? '...' : '') + '</div>' +
                '<div class="queue-item-status">Queued</div>' +
                '<button class="queue-item-remove" onclick="removeFromQueue(' + idx + ')" title="Remove">&times;</button>' +
            '</div>';
        });

        list.innerHTML = html;
    }

    function addToQueue(message, images, files, project) {
        messageQueue.push({
            message: message,
            images: images || [],
            files: files || [],
            project: project || '',
            addedAt: Date.now()
        });
        renderQueuePanel();
        showToast('Message added to queue (#' + messageQueue.length + ')', 'success');
        processQueue();
    }

    function removeFromQueue(idx) {
        messageQueue.splice(idx, 1);
        renderQueuePanel();
        showToast('Message removed from queue', 'success');
    }
    window.removeFromQueue = removeFromQueue;
    window.addToQueue = addToQueue;
    window.renderQueuePanel = renderQueuePanel;

    function clearQueue() {
        if (messageQueue.length === 0) {
            showToast('Queue is already empty', 'error');
            return;
        }
        if (confirm('Clear ' + messageQueue.length + ' queued messages?')) {
            messageQueue = [];
            renderQueuePanel();
            showToast('Queue cleared', 'success');
        }
    }
    window.clearQueue = clearQueue;

    async function processQueue() {
        if (isProcessingQueue || currentJobId || messageQueue.length === 0) {
            return;
        }

        isProcessingQueue = true;
        var item = messageQueue.shift();
        renderQueuePanel();

        await sendMessageDirect(item.message, item.images, item.files, item.project);

        isProcessingQueue = false;
    }

    function onJobComplete() {
        // Capture task title before clearing state
        var taskTitle = currentJobTitle || 'Task';

        currentJobId = null;
        currentJobProject = null;
        currentJobTitle = null;
        clearPersistedJobState();

        isPaused = false;
        pausedJobId = null;
        stopStreaming();
        hideAckBanner();
        renderQueuePanel();
        updatePauseButton();

        // Note: Voice recording resume is handled by the speak() function's onend callback
        // after the "Task completed" announcement finishes playing

        setTimeout(processQueue, 500);

        // Return task title for completion announcements
        return taskTitle;
    }

    // ========== JOB STATE PERSISTENCE ==========
    function saveJobState(jobId, project, userMessage) {
        currentJobId = jobId;
        currentJobProject = project;
        currentJobTitle = extractTaskTitle(userMessage);

        localStorage.setItem('chatRelayCurrentJobId', jobId);
        localStorage.setItem('chatRelayCurrentJobProject', project);
        localStorage.setItem('chatRelayCurrentJobTitle', currentJobTitle);
    }

    function clearPersistedJobState() {
        localStorage.removeItem('chatRelayCurrentJobId');
        localStorage.removeItem('chatRelayCurrentJobProject');
        localStorage.removeItem('chatRelayCurrentJobTitle');
    }

    function extractTaskTitle(message) {
        if (!message) return 'Task';

        // Remove agent mode prefixes
        var cleanMessage = message.replace(/^\[AGENT MODE:[^\]]+\]\s*/i, '').trim();
        cleanMessage = cleanMessage.replace(/^@\w+\s*/i, '').trim();

        // Common task patterns to extract meaningful titles
        var patterns = [
            // "add/create/implement X" -> "X"
            /^(?:add|create|implement|build|make|write)\s+(?:a\s+)?(?:new\s+)?(.+?)(?:\s+to\s+|\s+for\s+|\s+that\s+|\s+which\s+|$)/i,
            // "fix/debug/resolve X" -> "Fix X"
            /^(?:fix|debug|resolve|repair)\s+(?:the\s+)?(.+?)(?:\s+issue|\s+bug|\s+problem|$)/i,
            // "update/modify/change X" -> "Update X"
            /^(?:update|modify|change|edit)\s+(?:the\s+)?(.+?)(?:\s+to\s+|\s+so\s+|$)/i,
            // "remove/delete X" -> "Remove X"
            /^(?:remove|delete)\s+(?:the\s+)?(.+?)(?:\s+from\s+|$)/i,
            // "can you/please X" -> extract action
            /^(?:can you|please|could you)\s+(.+?)(?:\?|$)/i,
        ];

        for (var i = 0; i < patterns.length; i++) {
            var match = cleanMessage.match(patterns[i]);
            if (match && match[1]) {
                var title = match[1].trim();
                // Capitalize first letter and limit length
                title = title.charAt(0).toUpperCase() + title.slice(1);
                if (title.length > 40) {
                    title = title.substring(0, 37) + '...';
                }
                return title;
            }
        }

        // Fallback: use first few words
        var words = cleanMessage.split(/\s+/).slice(0, 5);
        var fallbackTitle = words.join(' ');
        if (fallbackTitle.length > 40) {
            fallbackTitle = fallbackTitle.substring(0, 37) + '...';
        }
        return fallbackTitle.charAt(0).toUpperCase() + fallbackTitle.slice(1) || 'Task';
    }

    // ========== ACK BANNER ==========
    function showAckBanner(text, isReceived) {
        var banner = document.getElementById('ackBanner');
        var ackText = document.getElementById('ackText');
        ackText.textContent = text;
        banner.style.display = 'flex';
        if (isReceived) {
            banner.classList.add('received');
        } else {
            banner.classList.remove('received');
        }
    }

    function hideAckBanner() {
        document.getElementById('ackBanner').style.display = 'none';
    }

    // ========== IMAGE/FILE HANDLING ==========
    function isTextFile(file) {
        var textTypes = ['text/', 'application/json', 'application/javascript', 'application/xml', 'application/x-python'];
        var textExtensions = ['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.html', '.css', '.scss', '.yaml', '.yml', '.xml', '.csv', '.sql', '.sh', '.bat', '.ps1', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt', '.r', '.m', '.vue', '.svelte', '.log', '.conf', '.ini', '.env', '.gitignore', '.dockerfile'];
        if (textTypes.some(function(t) { return file.type.startsWith(t); })) return true;
        var name = file.name.toLowerCase();
        return textExtensions.some(function(ext) { return name.endsWith(ext); });
    }

    function addFile(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            attachedFiles.push({ content: e.target.result, name: file.name, type: file.type });
            renderAttachments();
        };
        reader.readAsText(file);
    }

    function addImage(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var base64 = e.target.result;
            attachedImages.push({ data: base64, type: file.type, name: file.name });
            renderImages();
        };
        reader.readAsDataURL(file);
    }

    function renderAttachments() {
        renderImages();
        renderFiles();
    }

    function renderImages() {
        if (attachedImages.length === 0 && attachedFiles.length === 0) {
            imageContainer.style.display = 'none';
            return;
        }
        imageContainer.style.display = 'flex';
        imageContainer.innerHTML = '';
        attachedImages.forEach(function(img, idx) {
            var div = document.createElement('div');
            div.className = 'image-preview';
            div.innerHTML = '<img src="' + img.data + '"><button class="remove-btn" onclick="removeImage(' + idx + ')">&times;</button>';
            imageContainer.appendChild(div);
        });
    }

    function renderFiles() {
        if (attachedFiles.length === 0) return;
        imageContainer.style.display = 'flex';
        attachedFiles.forEach(function(file, idx) {
            var div = document.createElement('div');
            div.className = 'file-preview';
            div.innerHTML = '<span class="file-icon">&#128196;</span><span class="file-name" title="' + file.name + '">' + file.name + '</span><button class="remove-btn" onclick="removeFile(' + idx + ')">&times;</button>';
            imageContainer.appendChild(div);
        });
    }

    function removeImage(idx) {
        attachedImages.splice(idx, 1);
        renderAttachments();
    }
    window.removeImage = removeImage;

    function removeFile(idx) {
        attachedFiles.splice(idx, 1);
        renderAttachments();
    }
    window.removeFile = removeFile;

    // ========== INPUT EVENTS ==========
    inputArea.addEventListener('paste', function(e) {
        var items = e.clipboardData.items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                var file = items[i].getAsFile();
                addImage(file);
                break;
            }
        }
    });

    var brettPane = document.getElementById('brettPane');
    brettPane.addEventListener('dragover', function(e) { e.preventDefault(); brettPane.classList.add('drop-zone'); });
    brettPane.addEventListener('dragleave', function(e) { brettPane.classList.remove('drop-zone'); });
    brettPane.addEventListener('drop', function(e) {
        e.preventDefault();
        brettPane.classList.remove('drop-zone');
        var files = e.dataTransfer.files;
        for (var i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
                addImage(files[i]);
            } else if (isTextFile(files[i])) {
                addFile(files[i]);
            }
        }
    });

    // ========== VOICE ==========
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Voice command handler - returns true if command was handled
    function handleVoiceCommand(transcript) {
        var cmd = transcript.toLowerCase().trim();

        // Check for custom aliases first
        if (voiceAliases[cmd]) {
            cmd = voiceAliases[cmd];
        }

        // Stop read command - check this first so it works while reading
        if (cmd === 'stop read' || cmd === 'stop reading' || cmd === 'axion read stop' || cmd === 'axion stop' || cmd === 'axion stop read') {
            if (isSpeakingText) {
                stopSpeaking();
                return true;
            }
            showToast('Not currently reading', 'error');
            return true;
        }

        // Voice mode commands - "stop voice" = commands only, "start voice"/"run voice" = full dictation
        if (cmd === 'stop voice') {
            voiceCommandsOnly = true;
            voiceBtn.textContent = '🎯';
            showToast('Voice: Commands only mode', 'success');
            return true;
        }
        if (cmd === 'start voice' || cmd === 'run voice') {
            voiceCommandsOnly = false;
            voiceBtn.textContent = '⏹';
            showToast('Voice: Full dictation mode', 'success');
            return true;
        }

        // Text editing commands
        if (cmd === 'delete last word' || cmd === 'remove last word') {
            var text = inputArea.value;
            var newText = text.replace(/\s*\S+\s*$/, '');
            inputArea.value = newText;
            showToast('Deleted last word', 'success');
            return true;
        }
        if (cmd === 'delete all' || cmd === 'clear all' || cmd === 'delete everything') {
            inputArea.value = '';
            showToast('Cleared all text', 'success');
            return true;
        }
        if (cmd === 'delete last sentence' || cmd === 'remove last sentence') {
            var text = inputArea.value;
            var newText = text.replace(/[.!?]\s*[^.!?]*$|^[^.!?]+$/, '');
            inputArea.value = newText.trim();
            showToast('Deleted last sentence', 'success');
            return true;
        }
        if (cmd === 'undo' || cmd === 'undo that') {
            document.execCommand('undo');
            showToast('Undo', 'success');
            return true;
        }
        if (cmd === 'new line' || cmd === 'newline') {
            if (bulletMode) {
                inputArea.value += '\n- ';
                showToast('New bullet', 'success');
            } else if (numberedMode) {
                numberedCounter++;
                inputArea.value += '\n' + numberedCounter + '. ';
                showToast('Item ' + numberedCounter, 'success');
            } else {
                inputArea.value += '\n';
                showToast('New line', 'success');
            }
            updateLineNumbers();
            return true;
        }
        if (cmd === 'new paragraph' || cmd === 'new para') {
            // Exit list modes on paragraph
            bulletMode = false;
            numberedMode = false;
            numberedCounter = 1;
            inputArea.value += '\n\n';
            updateLineNumbers();
            showToast('New paragraph', 'success');
            return true;
        }

        // Bullet point commands
        if (cmd === 'bullet point' || cmd === 'bullet points' || cmd === 'run bullet' || cmd === 'run bullets') {
            bulletMode = true;
            numberedMode = false;
            // Add bullet on new line
            var val = inputArea.value;
            if (val && !val.endsWith('\n')) val += '\n';
            inputArea.value = val + '- ';
            updateLineNumbers();
            showToast('Bullet mode ON - say "stop bullet" to exit', 'success');
            return true;
        }
        if (cmd === 'stop bullet' || cmd === 'stop bullets' || cmd === 'end bullet' || cmd === 'end bullets') {
            bulletMode = false;
            showToast('Bullet mode OFF', 'success');
            return true;
        }

        // Numbered list commands
        if (cmd === 'numbered list' || cmd === 'number list' || cmd === 'run numbered' || cmd === 'run numbers') {
            numberedMode = true;
            bulletMode = false;
            numberedCounter = 1;
            // Add first number on new line
            var val = inputArea.value;
            if (val && !val.endsWith('\n')) val += '\n';
            inputArea.value = val + '1. ';
            updateLineNumbers();
            showToast('Numbered list ON - say "stop numbered" to exit', 'success');
            return true;
        }
        if (cmd === 'stop numbered' || cmd === 'stop numbers' || cmd === 'end numbered' || cmd === 'end numbers' || cmd === 'stop number list') {
            numberedMode = false;
            numberedCounter = 1;
            showToast('Numbered list OFF', 'success');
            return true;
        }

        // Go to line command
        var goToMatch = cmd.match(/^go to line (\d+)$/);
        if (goToMatch) {
            goToLine(parseInt(goToMatch[1], 10));
            return true;
        }
        // Also support "line X" as shorthand
        var lineMatch = cmd.match(/^line (\d+)$/);
        if (lineMatch) {
            goToLine(parseInt(lineMatch[1], 10));
            return true;
        }

        // Fullscreen commands
        if (cmd === 'stop fullscreen' || cmd === 'stop full screen' || cmd === 'exit fullscreen' || cmd === 'exit full screen') {
            if (document.fullscreenElement) {
                document.exitFullscreen();
                showToast('Exited fullscreen', 'success');
            } else {
                showToast('Not in fullscreen', 'error');
            }
            return true;
        }

        if (cmd.startsWith('run ')) {
            var action = cmd.substring(4).trim();
            if (action === 'send') { sendMessage(); showToast('Running: Send', 'success'); return true; }
            if (action === 'format') { formatInput(); showToast('Running: Format', 'success'); return true; }
            if (action === 'read') { readInput(); showToast('Running: Read', 'success'); return true; }
            if (action === 'stop') { stopJob(); showToast('Running: Stop', 'success'); return true; }
            if (action === 'stop read' || action === 'stop reading') { stopSpeaking(); return true; }
            if (action === 'clear') { inputArea.value = ''; showToast('Brett: Cleared', 'success'); return true; }
            if (action === 'fullscreen' || action === 'full screen' || action === 'f11') {
                document.documentElement.requestFullscreen();
                showToast('Entering fullscreen', 'success');
                return true;
            }
            if (action === 'review task' || action === 'reviewtask') {
                inputArea.value = '/reviewtask';
                sendMessage();
                showToast('Running: Review Task', 'success');
                return true;
            }
            if (action === 'explain') {
                inputArea.value = '/explain';
                sendMessage();
                showToast('Running: Explain', 'success');
                return true;
            }
            if (action === 'implement') {
                inputArea.value = '/implement';
                sendMessage();
                showToast('Running: Implement', 'success');
                return true;
            }
            if (action === 'commit') {
                openGitModal();
                showToast('Opening: Git', 'success');
                return true;
            }
            if (action === 'open editor' || action === 'open files' || action === 'file browser' || action === 'open file browser') {
                openFileBrowser();
                showToast('Opening: File Browser', 'success');
                return true;
            }
            if (action === 'close editor' || action === 'close files' || action === 'close file browser') {
                closeFileBrowser();
                showToast('Closing: File Browser', 'success');
                return true;
            }
            if (action === 'save file') {
                if (editorState.currentFile) {
                    saveFile();
                    showToast('Saving file...', 'success');
                } else {
                    showToast('No file open to save', 'error');
                }
                return true;
            }
            if (action === 'read file' || action === 'read file aloud') {
                if (editorState.currentFile) {
                    readFileAloud();
                } else {
                    showToast('No file open to read', 'error');
                }
                return true;
            }
            // Q&A panel commands
            if (action === 'open qa' || action === 'open questions' || action === 'ask questions') {
                if (editorState.currentFile) {
                    toggleQaPanel();
                    showToast('Q&A panel opened', 'success');
                } else {
                    showToast('Open a file first', 'error');
                }
                return true;
            }
            if (action === 'close qa' || action === 'close questions') {
                var qaPanel = document.getElementById('qaPanel');
                if (qaPanel && qaPanel.style.display !== 'none') {
                    toggleQaPanel();
                }
                showToast('Q&A panel closed', 'success');
                return true;
            }
            if (action === 'clear questions' || action === 'clear qa') {
                clearQaHistory();
                return true;
            }
            // Accept/revert changes commands
            if (action === 'accept changes' || action === 'accept change') {
                if (diffState.isActive) {
                    acceptChanges();
                } else {
                    showToast('No pending changes', 'error');
                }
                return true;
            }
            if (action === 'revert changes' || action === 'revert' || action === 'reject changes') {
                if (diffState.isActive) {
                    revertChanges();
                } else {
                    showToast('No pending changes', 'error');
                }
                return true;
            }
            if (action === 'refresh') {
                showToast('Refreshing page...', 'success');
                setTimeout(function() { window.location.reload(); }, 500);
                return true;
            }

            // Check if action matches a project name - open in new tab
            var projectUrls = {
                'claimsai': { url: 'http://127.0.0.1:5173/', name: 'ClaimsAI', port: 5173 },
                'claims ai': { url: 'http://127.0.0.1:5173/', name: 'ClaimsAI', port: 5173 },
                'claims': { url: 'http://127.0.0.1:5173/', name: 'ClaimsAI', port: 5173 },
                'hubai': { url: 'http://127.0.0.1:5174/', name: 'HUBAi', port: 5174 },
                'hub ai': { url: 'http://127.0.0.1:5174/', name: 'HUBAi', port: 5174 },
                'hub': { url: 'http://127.0.0.1:5174/', name: 'HUBAi', port: 5174 },
                'relay': { url: 'http://127.0.0.1:8765/', name: 'Relay', port: 8765 }
            };
            var normalizedAction = action.replace(/\s+/g, '').toLowerCase();
            var projectMatch = projectUrls[action.toLowerCase()] || projectUrls[normalizedAction];
            if (projectMatch) {
                showToast('Checking ' + projectMatch.name + '...', 'success');
                // Check if service is running via API
                fetch('/api/service/check', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ port: projectMatch.port })
                })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.running) {
                        showToast('Opening ' + projectMatch.name, 'success');
                        window.open(projectMatch.url, '_blank');
                    } else {
                        showToast(projectMatch.name + ' is not running on port ' + projectMatch.port, 'error');
                    }
                })
                .catch(function() {
                    // Fallback - try opening anyway
                    showToast('Opening ' + projectMatch.name + '...', 'success');
                    window.open(projectMatch.url, '_blank');
                });
                return true;
            }
        }

        // Axion panel commands: "axion [action]"
        if (cmd.startsWith('axion ')) {
            var axionAction = cmd.substring(6).trim();
            if (axionAction === 'clear') { clearResponse(); showToast('Axion: Clear', 'success'); return true; }
            if (axionAction === 'screenshots' || axionAction === 'screenshot') {
                openScreenshotGallery();
                showToast('Axion: Screenshots', 'success');
                return true;
            }
            if (axionAction === 'read') { readResponse(); showToast('Axion: Read', 'success'); return true; }
        }

        // Q&A voice commands: "ask about file [question]" or "question [question]"
        if (cmd.startsWith('ask about file ') || cmd.startsWith('ask file ')) {
            var question = cmd.replace(/^ask (about )?file\s+/i, '').trim();
            if (question && editorState.currentFile) {
                // Open Q&A panel if not open
                var qaPanel = document.getElementById('qaPanel');
                if (!qaPanel || qaPanel.style.display === 'none') {
                    toggleQaPanel();
                }
                submitQaQuestion(question);
                showToast('Asking: ' + question.substring(0, 30) + '...', 'success');
            } else if (!editorState.currentFile) {
                showToast('Open a file first', 'error');
            }
            return true;
        }
        if (cmd.startsWith('question ')) {
            var question = cmd.substring(9).trim();
            if (question && editorState.currentFile) {
                var qaPanel = document.getElementById('qaPanel');
                if (!qaPanel || qaPanel.style.display === 'none') {
                    toggleQaPanel();
                }
                submitQaQuestion(question);
                showToast('Asking: ' + question.substring(0, 30) + '...', 'success');
            } else if (!editorState.currentFile) {
                showToast('Open a file first', 'error');
            }
            return true;
        }

        // File modification commands: "modify file [instruction]" or "change file [instruction]" or "edit file [instruction]"
        if (cmd.startsWith('modify file ') || cmd.startsWith('change file ') || cmd.startsWith('edit file ')) {
            var instruction = cmd.replace(/^(modify|change|edit) file\s+/i, '').trim();
            if (instruction && editorState.currentFile) {
                requestFileModification(instruction);
            } else if (!editorState.currentFile) {
                showToast('Open a file first', 'error');
            }
            return true;
        }

        // Project switching: "open [project name]"
        if (cmd.startsWith('open ')) {
            var projectName = cmd.substring(5).trim();
            // Normalize: remove spaces, lowercase for comparison
            var normalizedInput = projectName.replace(/\s+/g, '').toLowerCase();
            var select = document.getElementById('projectSelect');
            var options = select.options;
            for (var i = 0; i < options.length; i++) {
                // Skip empty/placeholder options
                if (!options[i].value) continue;

                var optText = options[i].text.replace(/\s+/g, '').toLowerCase();
                var optValue = options[i].value.replace(/\s+/g, '').toLowerCase();

                // Match if normalized versions match, or if one contains the other
                // Only check contains if both strings have content
                if (optText === normalizedInput || optValue === normalizedInput ||
                    (normalizedInput.length > 0 && optText.includes(normalizedInput)) ||
                    (optText.length > 0 && normalizedInput.includes(optText)) ||
                    (normalizedInput.length > 0 && optValue.includes(normalizedInput)) ||
                    (optValue.length > 0 && normalizedInput.includes(optValue))) {
                    select.value = options[i].value;
                    select.dispatchEvent(new Event('change'));
                    showToast('Opened: ' + options[i].text, 'success');
                    return true;
                }
            }
            showToast('Project not found: ' + projectName, 'error');
            return true; // Still handled, just failed
        }

        return false; // Not a command
    }

    if (SR) {
        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = function(e) {
            var transcript = '';
            for (var i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            if (e.results[e.resultIndex].isFinal) {
                // Filter low-confidence results (below 0.5)
                var confidence = e.results[e.resultIndex][0].confidence;
                if (confidence > 0 && confidence < 0.5) {
                    console.log('Low confidence (' + confidence.toFixed(2) + '), skipping: ' + transcript);
                    return;
                }
                // Strip filler words for cleaner input
                transcript = stripFillerWords(transcript);
                if (!transcript.trim()) return;
                // Check if it's a voice command first - always process commands
                if (handleVoiceCommand(transcript)) {
                    return; // Command handled, don't add to input
                }
                // If in commands-only mode, don't add text to input
                if (voiceCommandsOnly) {
                    return; // Ignore non-command speech in commands-only mode
                }
                // If speaking/reading, don't add text to input - only listen for commands
                if (isSpeakingText) {
                    return; // Ignore non-command speech while reading
                }
                // Not a command and not reading, add to input area as text
                var cursorPos = inputArea.selectionStart;
                var textBefore = inputArea.value.substring(0, cursorPos);
                var textAfter = inputArea.value.substring(inputArea.selectionEnd);
                var textToAdd = transcript + ' ';

                // Handle bullet mode - add bullet on new lines
                if (bulletMode && textBefore.endsWith('\n')) {
                    textToAdd = '- ' + transcript + ' ';
                }
                // Handle numbered mode - add number on new lines
                if (numberedMode && textBefore.endsWith('\n')) {
                    numberedCounter++;
                    textToAdd = numberedCounter + '. ' + transcript + ' ';
                }

                inputArea.value = textBefore + textToAdd + textAfter;
                var newPos = cursorPos + textToAdd.length;
                inputArea.setSelectionRange(newPos, newPos);
                inputArea.focus();
                updateLineNumbers();
            }
        };
        recognition.onend = function() {
            if (isRecording) recognition.start();
        };
    }

    function toggleVoice() {
        if (!SR) { showToast('Voice not supported in this browser', 'error'); return; }
        // Reset any stuck speech state
        isSpeakingText = false;
        isRecording = !isRecording;
        localStorage.setItem('voiceEnabled', isRecording ? 'true' : 'false');
        if (isRecording) {
            // Stop Q&A voice if it's active - can't have both
            if (typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive && qaRecognition) {
                try { qaRecognition.stop(); } catch(e) {}
                qaState.isVoiceActive = false;
            }
            try {
                recognition.start();
            } catch(e) {
                // Already started - stop and restart
                try { recognition.stop(); } catch(e2) {}
                setTimeout(function() { try { recognition.start(); } catch(e3) {} }, 200);
            }
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? 'Cmds' : 'Stop';
            voiceDots.classList.add('active');
        } else {
            try { recognition.stop(); } catch(e) {}
            voiceCommandsOnly = false; // Reset to full mode when turning off
            voiceBtn.classList.remove('recording');
            voiceBtn.textContent = '🎤';
            voiceDots.classList.remove('active');
        }
    }
    window.toggleVoice = toggleVoice;

    var isSpeakingText = false;

    // Clean markdown symbols from text for natural speech
    function stripFillerWords(text) {
        return text
            .replace(/\b(um|uh|uhh|umm|hmm|hm|er|err|ah|ahh|like|you know|I mean|basically|actually|literally|so yeah|yeah so)\b/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function cleanTextForSpeech(text) {
        var cleaned = text
            // Skip multi-line code blocks entirely
            .replace(/```[\w]*\n[\s\S]*?```/g, '... Skipping code block... ')
            // Short inline code blocks (1-3 words) - keep the text
            .replace(/```([^`\n]{1,30})```/g, '$1')
            // Any remaining code blocks
            .replace(/```[\s\S]*?```/g, '... Skipping code block... ')
            // Remove inline code backticks but keep short text
            .replace(/`([^`]+)`/g, '$1')
            // Headers become announcements with a pause
            .replace(/^#{1,2}\s+(.+)$/gm, '... $1. ')
            .replace(/^#{3,6}\s+(.+)$/gm, '$1. ')
            // Bold text - these are usually important, add slight emphasis marker
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            // Remove italic *text* or _text_
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            // Remove strikethrough ~~text~~
            .replace(/~~([^~]+)~~/g, '$1')
            // Remove links [text](url) - keep the text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove images ![alt](url)
            .replace(/!\[[^\]]*\]\([^)]+\)/g, ' image ')
            // Remove horizontal rules - add a pause
            .replace(/^[-*_]{3,}$/gm, '...')
            // Remove blockquote markers
            .replace(/^>\s*/gm, '')
            // Bullet points - add natural list reading
            .replace(/^[\-\*\+]\s+/gm, '... ')
            // Numbered lists - convert to spoken ordinals for first few
            .replace(/^1\.\s+/gm, '... First, ')
            .replace(/^2\.\s+/gm, '... Second, ')
            .replace(/^3\.\s+/gm, '... Third, ')
            .replace(/^4\.\s+/gm, '... Fourth, ')
            .replace(/^5\.\s+/gm, '... Fifth, ')
            .replace(/^\d+\.\s+/gm, '... Next, ')
            // Remove HTML tags
            .replace(/<[^>]+>/g, '')
            // Remove file paths
            .replace(/\/[\w\-\.\/]+\.(js|py|ts|html|css|json|md|txt|yaml|yml)/g, '')
            // Remove line number references
            .replace(/\blines?\s+\d+[\-–]\d+/gi, '')
            // Parenthetical asides - add brief pauses around them
            .replace(/\(([^)]{5,})\)/g, ', $1, ')
            // Colons introducing lists or explanations - add pause
            .replace(/:\s*\n/g, '... ')
            // Semicolons - natural pause point
            .replace(/;\s*/g, '... ')
            // Em dashes - pause
            .replace(/\s*[—–]\s*/g, '... ')
            // Clean up multiple skipping messages
            .replace(/(\.{3}\s*Skipping code block\.{3}\s*){2,}/g, '... Skipping code blocks... ')
            // Clean up excessive ellipses
            .replace(/(\.{3}\s*){3,}/g, '... ')
            // Clean up multiple spaces and newlines
            .replace(/\n{2,}/g, '... ')
            .replace(/\n/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\.\s*\./g, '.') // Remove double periods
            .trim();

        return cleaned;
    }

    function speak(text, panel) {
        cancelAllSpeech();

        // Pause Brett voice recording while Axion is speaking
        if (isRecording && recognition) {
            wasRecordingBeforeSpeak = true;
            recognition.stop();
            isRecording = false;
            voiceBtn.classList.remove('recording');
            voiceBtn.textContent = '🎤';
            voiceDots.classList.remove('active');
        }

        // Keep voice recording active for commands, but mark that we're speaking
        // so voice input doesn't add text to the input area
        isSpeakingText = true;

        // Clean markdown for natural speech
        var cleanedText = cleanTextForSpeech(text);

        // Route to Edge TTS if selected
        if (voiceSettings.engine === 'edge-tts') {
            var edgeVoice = panel === 'axion'
                ? (voiceSettings.axionEdgeVoice || 'en-US-GuyNeural')
                : (voiceSettings.brettEdgeVoice || 'en-US-JennyNeural');

            speakWithEdgeTts(cleanedText, edgeVoice, function() {
                // Same onend logic as browser speech
                var qaActive = typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive;
                if (qaActive) return;
                if (wasRecordingBeforeSpeak && recognition) {
                    wasRecordingBeforeSpeak = false;
                    try {
                        isRecording = true;
                        recognition.start();
                        voiceBtn.classList.add('recording');
                        voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                        voiceDots.classList.add('active');
                    } catch(e) { console.error('Voice restore error:', e); }
                }
                if (wasRecordingBeforeTask && recognition) {
                    wasRecordingBeforeTask = false;
                    try {
                        isRecording = true;
                        recognition.start();
                        voiceBtn.classList.add('recording');
                        voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                        voiceDots.classList.add('active');
                    } catch(e) { console.error('Voice restore error:', e); }
                }
            });
            return;
        }

        // Route to ElevenLabs if selected
        if (voiceSettings.engine === 'elevenlabs') {
            var elevenVoice = panel === 'axion'
                ? (voiceSettings.axionElevenVoice || '')
                : (voiceSettings.brettElevenVoice || '');
            var stability = voiceSettings.elevenStability || 0.5;
            var similarity = voiceSettings.elevenSimilarity || 0.75;

            if (!elevenVoice) {
                // Fall back to browser if no ElevenLabs voice configured
                console.warn('No ElevenLabs voice configured, falling back to browser');
            } else {
                speakWithElevenLabs(cleanedText, elevenVoice, stability, similarity, function() {
                    var qaActive = typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive;
                    if (qaActive) return;
                    if (wasRecordingBeforeSpeak && recognition) {
                        wasRecordingBeforeSpeak = false;
                        try {
                            isRecording = true;
                            recognition.start();
                            voiceBtn.classList.add('recording');
                            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                            voiceDots.classList.add('active');
                        } catch(e) { console.error('Voice restore error:', e); }
                    }
                    if (wasRecordingBeforeTask && recognition) {
                        wasRecordingBeforeTask = false;
                        try {
                            isRecording = true;
                            recognition.start();
                            voiceBtn.classList.add('recording');
                            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                            voiceDots.classList.add('active');
                        } catch(e) { console.error('Voice restore error:', e); }
                    }
                });
                return;
            }
        }

        // Browser speech engine (default)
        var u = new SpeechSynthesisUtterance(cleanedText);
        var voiceName = panel === 'axion' ? voiceSettings.axion : voiceSettings.brett;
        if (voiceName) {
            var voices = window.speechSynthesis.getVoices();
            var voice = voices.find(function(v) { return v.name === voiceName; });
            if (voice) u.voice = voice;
        }
        // Apply pitch and rate settings for AXION voice
        if (panel === 'axion') {
            u.pitch = voiceSettings.axionPitch || 1.0;
            u.rate = voiceSettings.axionRate || 1.0;
        }

        u.onend = function() {
            isSpeakingText = false;
            // Don't restore main recognition if Q&A voice is active - it would conflict
            var qaActive = typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive;
            if (qaActive) return;
            // Restore voice recording if it was on before speaking
            if (wasRecordingBeforeSpeak && recognition) {
                wasRecordingBeforeSpeak = false;
                try {
                    isRecording = true;
                    recognition.start();
                    voiceBtn.classList.add('recording');
                    voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                    voiceDots.classList.add('active');
                    showToast('Voice resumed', 'success');
                } catch(e) { console.error('Voice restore error:', e); }
            }
            // Also check for wasRecordingBeforeTask (for task completion)
            if (wasRecordingBeforeTask && recognition) {
                wasRecordingBeforeTask = false;
                try {
                    isRecording = true;
                    recognition.start();
                    voiceBtn.classList.add('recording');
                    voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                    voiceDots.classList.add('active');
                } catch(e) { console.error('Voice restore error:', e); }
            }
        };

        u.onerror = function() {
            isSpeakingText = false;
            // Don't restore main recognition if Q&A voice is active - it would conflict
            var qaActive = typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive;
            if (qaActive) return;
            // Restore voice recording if it was on before speaking
            if (wasRecordingBeforeSpeak && recognition) {
                wasRecordingBeforeSpeak = false;
                try {
                    isRecording = true;
                    recognition.start();
                    voiceBtn.classList.add('recording');
                    voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                    voiceDots.classList.add('active');
                } catch(e) { console.error('Voice restore error:', e); }
            }
            // Also check for wasRecordingBeforeTask (for task completion)
            if (wasRecordingBeforeTask && recognition) {
                wasRecordingBeforeTask = false;
                try {
                    isRecording = true;
                    recognition.start();
                    voiceBtn.classList.add('recording');
                    voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                    voiceDots.classList.add('active');
                } catch(e) { console.error('Voice restore error:', e); }
            }
        };

        window.speechSynthesis.speak(u);
    }

    // Utility: cancel ALL speech engines (browser + Edge TTS)
    function cancelAllSpeech() {
        window.speechSynthesis.cancel();
        if (edgeTtsAudio) {
            edgeTtsAudio.pause();
            edgeTtsAudio = null;
        }
        // Cancel any chunked Edge TTS session
        edgeTtsSessionId++;
        edgeTtsChunkQueue = [];
    }

    function stopSpeaking() {
        cancelAllSpeech();
        isSpeakingText = false;
        // Don't restore main recognition if Q&A voice is active
        var qaActive = typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive;
        if (qaActive) return;
        // Restore voice recording if it was on before speaking
        if (wasRecordingBeforeSpeak && recognition) {
            wasRecordingBeforeSpeak = false;
            isRecording = true;
            recognition.start();
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
            voiceDots.classList.add('active');
            showToast('Stopped reading, voice resumed', 'success');
        } else {
            showToast('Stopped reading', 'success');
        }
    }
    window.stopSpeaking = stopSpeaking;

    function readResponse() {
        // Toggle: if already speaking, stop
        if (isSpeakingText) {
            stopSpeaking();
            return;
        }

        // Only read assistant responses, not user input or tasks
        var text = '';

        // Check live content first - extract only assistant parts
        if (liveActivityContent) {
            var liveAssistant = liveActivityContent.querySelectorAll('.message-assistant');
            if (liveAssistant.length > 0) {
                // Get the last assistant message from live content
                text = liveAssistant[liveAssistant.length - 1].innerText.trim();
                // Remove "Axion:" or "Axion (streaming...):" prefix
                text = text.replace(/^Axion(\s*\([^)]*\))?:\s*/i, '');
            } else {
                // If no message-assistant divs, get all live content but filter
                var liveText = liveActivityContent.innerText.trim();
                // Check if it's useful content (not just status)
                if (liveText && liveText.length > 50 && liveText.indexOf('Waiting') === -1) {
                    text = liveText;
                }
            }
        }

        // If no live content, check history for assistant messages
        if (!text && responseArea) {
            var assistantMsgs = responseArea.querySelectorAll('.message-assistant');
            if (assistantMsgs.length > 0) {
                // Get the last assistant message
                text = assistantMsgs[assistantMsgs.length - 1].innerText.trim();
                // Remove "Axion:" prefix
                text = text.replace(/^Axion:\s*/i, '');
            }
        }

        // Check if it's just placeholder text
        var placeholders = ['Waiting...', 'LIVE', 'Sending to Claude'];
        var isPlaceholder = placeholders.some(function(p) { return text.indexOf(p) !== -1 && text.length < 100; });

        if (!text || isPlaceholder) {
            showToast('Nothing to read', 'error');
            return;
        }

        speak(text, 'axion');
        showToast('Reading Axion response... say "stop read" to stop', 'success');
    }
    window.readResponse = readResponse;

    function readInput() {
        // Toggle: if already speaking, stop
        if (isSpeakingText) {
            stopSpeaking();
            return;
        }
        var text = inputArea.value;
        if (!text) { showToast('Nothing to read', 'error'); return; }
        speak(text, 'brett');
        showToast('Reading... click again to stop', 'success');
    }
    window.readInput = readInput;

    // Copy input text to clipboard
    function copyInputText() {
        var text = inputArea.value;
        if (!text) {
            showToast('Nothing to copy', 'error');
            return;
        }
        navigator.clipboard.writeText(text).then(function() {
            showToast('Copied!', 'success');
        }).catch(function(err) {
            console.error('Copy failed:', err);
            showToast('Failed to copy', 'error');
        });
    }
    window.copyInputText = copyInputText;

    // Clear input text
    function clearInput() {
        inputArea.value = '';
        inputArea.focus();
        showToast('Cleared', 'success');
    }
    window.clearInput = clearInput;

    // ========== AUTO-READ FUNCTIONALITY ==========
    // Default to ON if not explicitly set
    var autoReadEnabled = voiceSettings.autoRead !== false;
    var lastSpokenText = '';
    var speakQueue = [];
    var isSpeaking = false;

    function updateAutoReadButton() {
        var btn = document.getElementById('autoReadBtn');
        if (autoReadEnabled) {
            btn.textContent = '🔊';
            btn.classList.add('active');
            btn.style.background = 'var(--success)';
            btn.style.borderColor = 'var(--success)';
            btn.title = 'Auto-read: ON';
        } else {
            btn.textContent = '🔇';
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.title = 'Auto-read: OFF';
        }
    }

    function toggleAutoRead() {
        autoReadEnabled = !autoReadEnabled;
        voiceSettings.autoRead = autoReadEnabled;
        localStorage.setItem('chatRelayVoices', JSON.stringify(voiceSettings));
        updateAutoReadButton();
        updateLiveBoxVoiceMode();

        if (autoReadEnabled) {
            showToast('Auto-read enabled - AXION will speak responses', 'success');
        } else {
            // Stop any ongoing speech and clear highlights
            cancelAllSpeech();
            speakQueue = [];
            isSpeaking = false;
            clearHighlight();
            showToast('Auto-read disabled', 'success');
        }
    }

    // Toggle between voice visualizer and text in live box based on auto-read
    function updateLiveBoxVoiceMode() {
        var content = document.getElementById('liveActivityContent');
        var visualizer = document.getElementById('liveVoiceVisualizer');
        if (!content || !visualizer) return;

        if (autoReadEnabled) {
            content.classList.add('voice-mode');
            visualizer.classList.add('active');
        } else {
            content.classList.remove('voice-mode');
            visualizer.classList.remove('active');
        }
    }
    window.toggleAutoRead = toggleAutoRead;

    // ========== PAUSE/INTERRUPT FUNCTIONALITY ==========
    var isPaused = false;
    var pausedJobId = null;

    function updatePauseButton() {
        var btn = document.getElementById('pauseBtn');
        if (!btn) return;

        // Only show pause button when a job is running
        if (currentJobId && !isPaused) {
            btn.style.display = 'flex';
            btn.textContent = '⏸';
            btn.title = 'Pause job';
            btn.classList.remove('success');
            btn.classList.add('danger');
        } else if (isPaused) {
            btn.style.display = 'flex';
            btn.textContent = '▶';
            btn.title = 'Continue job';
            btn.classList.remove('danger');
            btn.classList.add('success');
        } else {
            btn.style.display = 'none';
        }
    }

    function togglePause() {
        if (!isPaused && currentJobId) {
            // PAUSE - stop polling, let user add more info
            isPaused = true;
            pausedJobId = currentJobId;
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
            // Stop speech
            cancelAllSpeech();
            speakQueue = [];
            isSpeaking = false;
            clearHighlight();

            updatePauseButton();
            showToast('Paused - add more info in BRETT, then click Continue', 'success');
            statusEl.textContent = 'Paused - waiting for your input...';

            // Focus on input area
            inputArea.focus();

        } else if (isPaused) {
            // CONTINUE - check if user added more input
            var additionalInput = inputArea.value.trim();

            if (additionalInput) {
                // User added more info - send it as a follow-up
                showToast('Sending additional info...', 'success');
                isPaused = false;

                // Add the additional context to the current conversation
                var followUpMsg = '[Additional context from user]: ' + additionalInput;
                inputArea.value = '';

                // Resume with the additional info
                sendMessageDirect(followUpMsg, [], [], document.getElementById('projectSelect').value);
            } else {
                // No additional input - just resume polling
                isPaused = false;
                updatePauseButton();
                showToast('Resuming...', 'success');

                // Restart polling for the paused job
                if (pausedJobId) {
                    currentJobId = pausedJobId;
                    startPolling(pausedJobId, document.getElementById('projectSelect').value);
                }
            }
            pausedJobId = null;
        }
    }
    window.togglePause = togglePause;
    window.updatePauseButton = updatePauseButton;
    // Expose isPaused as a property so tests can check it
    Object.defineProperty(window, 'isPaused', {
        get: function() { return isPaused; },
        set: function(val) { isPaused = val; }
    });
    // Expose currentJobId as a property so tests can set it
    Object.defineProperty(window, 'currentJobId', {
        get: function() { return currentJobId; },
        set: function(val) { currentJobId = val; }
    });

    // Speak new text incrementally (for streaming)
    // Now receives pre-cleaned text from cleanLiveText, same as what's shown in live box
    function speakNewContent(cleanedChunk) {
        if (!autoReadEnabled || !cleanedChunk) return;

        // Text is already cleaned by cleanLiveText - just do minimal additional filtering
        var textOnly = cleanedChunk
            .replace(/<[^>]+>/g, '')  // Remove any remaining HTML tags
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .trim();

        // Skip patterns for content that shouldn't be spoken
        var skipPatterns = [
            /^\s*(Reading|Editing|Searching|Finding|Running|Planning|Using)[\s:\.]*.*$/i,  // Tool status lines
            /^Running[:\s]+/i,  // "Running: command" lines
            /^(Reading|Editing|Writing|Searching)[:\s]+/i,  // File operation lines
            /^Using \w+/i,  // "Using TodoWrite" etc
            /^[\s\-\*•]+$/,  // Empty or bullet-only lines
            /^(ok|okay|done|yes|no)\.?$/i,  // Very short acknowledgments only
            /^\[code\]$/i,  // Just "[code]" placeholder
            /^\[image\]$/i,  // Just "[image]" placeholder
            /^\[screenshot\]$/i,  // Just "[screenshot]" placeholder
            /^app\.js$/i,  // Just filename
            /^index\.html$/i,  // Just filename
            /^styles\.css$/i,  // Just filename
            /^watcher\.py$/i,  // Just filename
            /^\w+\.(js|py|ts|html|css|json|md)$/i,  // Any single filename
        ];

        // Skip if too short or matches skip pattern
        if (!textOnly || textOnly.length < 5) return;
        var shouldSkip = skipPatterns.some(function(pattern) {
            return pattern.test(textOnly);
        });
        if (shouldSkip) return;

        // Split into sentences at natural break points
        // Handles: periods, exclamation, question marks, ellipsis pauses, colons, semicolons
        var sentences = textOnly.match(/[^.!?;:]+[.!?]+\s*|\.{3}\s*[^.!?;:]+|[^.!?;:]+[;:]\s+|[^.!?;:]{40,}(?=\s|$)/g);

        if (sentences && sentences.length > 0) {
            sentences.forEach(function(sentence) {
                var trimmed = sentence.trim();
                if (!trimmed || trimmed.length < 4) return;
                // Skip lines that look like code (lots of symbols, brackets, etc)
                var codeChars = (trimmed.match(/[{}\[\]()=<>;\/\\|&^%$#@!~`]/g) || []).length;
                if (codeChars > trimmed.length * 0.15 && trimmed.length > 10) return;
                queueSpeech(trimmed);
            });
        } else if (textOnly.length > 10) {
            // No sentence structure but has content - speak it
            queueSpeech(textOnly);
        }
    }

    function queueSpeech(text) {
        speakQueue.push(text);
        processSpeakQueue();
    }

    // Highlighting removed - functions kept as stubs for compatibility
    function clearHighlight() { }

    function processSpeakQueue() {
        if (isSpeaking || speakQueue.length === 0 || !autoReadEnabled) return;

        isSpeaking = true;
        var text = speakQueue.shift();

        // Route to Edge TTS if selected
        if (voiceSettings.engine === 'edge-tts') {
            var edgeVoice = voiceSettings.axionEdgeVoice || 'en-US-GuyNeural';
            speakWithEdgeTts(text, edgeVoice, function() {
                isSpeaking = false;
                processSpeakQueue();
            });
            return;
        }

        // Route to ElevenLabs if selected
        if (voiceSettings.engine === 'elevenlabs' && voiceSettings.axionElevenVoice) {
            speakWithElevenLabs(text, voiceSettings.axionElevenVoice,
                voiceSettings.elevenStability || 0.5, voiceSettings.elevenSimilarity || 0.75,
                function() {
                    isSpeaking = false;
                    processSpeakQueue();
                });
            return;
        }

        // Browser speech engine
        var u = new SpeechSynthesisUtterance(text);
        var voiceName = voiceSettings.axion;
        if (voiceName) {
            var voices = window.speechSynthesis.getVoices();
            var voice = voices.find(function(v) { return v.name === voiceName; });
            if (voice) u.voice = voice;
        }
        // Base pitch/rate from settings
        var basePitch = voiceSettings.axionPitch || 1.0;
        var baseRate = voiceSettings.axionRate || 1.0;

        // Auto-adjust rate based on content type
        if (text.length < 30) {
            // Short confirmations - slightly faster
            u.rate = Math.min(baseRate * 1.15, 2.0);
        } else if (text.length > 150) {
            // Long explanations - slightly slower for clarity
            u.rate = Math.max(baseRate * 0.92, 0.5);
        } else {
            u.rate = baseRate;
        }
        u.pitch = basePitch;

        u.onend = function() {
            isSpeaking = false;
            processSpeakQueue();
        };

        u.onerror = function() {
            isSpeaking = false;
            processSpeakQueue();
        };

        window.speechSynthesis.speak(u);
    }

    function resetAutoReadState() {
        lastSpokenText = '';
        speakQueue = [];
        cancelAllSpeech();
        isSpeaking = false;
    }

    // Initialize button state
    setTimeout(updateAutoReadButton, 100);

    // ========== DISPLAY SETTINGS ==========
    function openDisplaySettings() {
        var modal = document.getElementById('displayModal');
        modal.style.display = 'block';
        // Set current values
        document.getElementById('axionFontSize').value = displaySettings.axionFontSize;
        document.getElementById('brettFontSize').value = displaySettings.brettFontSize;
        document.getElementById('axionSizeLabel').textContent = displaySettings.axionFontSize + 'px';
        document.getElementById('brettSizeLabel').textContent = displaySettings.brettFontSize + 'px';
        // File browser settings
        document.getElementById('editorFontSize').value = displaySettings.editorFontSize;
        document.getElementById('explainFontSize').value = displaySettings.explainFontSize;
        document.getElementById('fileTreeFontSize').value = displaySettings.fileTreeFontSize;
        document.getElementById('editorSizeLabel').textContent = displaySettings.editorFontSize + 'px';
        document.getElementById('explainSizeLabel').textContent = displaySettings.explainFontSize + 'px';
        document.getElementById('fileTreeSizeLabel').textContent = displaySettings.fileTreeFontSize + 'px';
    }
    window.openDisplaySettings = openDisplaySettings;

    function closeDisplaySettings() {
        document.getElementById('displayModal').style.display = 'none';
    }
    window.closeDisplaySettings = closeDisplaySettings;

    function previewAxionFont(size) {
        document.getElementById('axionSizeLabel').textContent = size + 'px';
        responseArea.style.setProperty('font-size', size + 'px', 'important');
    }
    window.previewAxionFont = previewAxionFont;

    function previewBrettFont(size) {
        document.getElementById('brettSizeLabel').textContent = size + 'px';
        inputArea.style.setProperty('font-size', size + 'px', 'important');
    }
    window.previewBrettFont = previewBrettFont;

    function previewEditorFont(size) {
        document.getElementById('editorSizeLabel').textContent = size + 'px';
        var editorTextarea = document.getElementById('editorTextarea');
        var editorLineNumbers = document.getElementById('editorLineNumbers');
        var editorHighlight = document.getElementById('editorHighlight');
        var px = size + 'px';
        if (editorTextarea) editorTextarea.style.setProperty('font-size', px, 'important');
        if (editorLineNumbers) editorLineNumbers.style.setProperty('font-size', px, 'important');
        if (editorHighlight) editorHighlight.style.setProperty('font-size', px, 'important');
    }
    window.previewEditorFont = previewEditorFont;

    function previewExplainFont(size) {
        document.getElementById('explainSizeLabel').textContent = size + 'px';
        var explainContent = document.getElementById('explainContent');
        if (explainContent) explainContent.style.setProperty('font-size', size + 'px', 'important');
    }
    window.previewExplainFont = previewExplainFont;

    function previewFileTreeFont(size) {
        document.getElementById('fileTreeSizeLabel').textContent = size + 'px';
        var fileTreeContainer = document.getElementById('fileTreeContainer');
        if (fileTreeContainer) fileTreeContainer.style.setProperty('font-size', size + 'px', 'important');
    }
    window.previewFileTreeFont = previewFileTreeFont;

    function saveDisplaySettings() {
        displaySettings.axionFontSize = parseInt(document.getElementById('axionFontSize').value);
        displaySettings.brettFontSize = parseInt(document.getElementById('brettFontSize').value);
        displaySettings.editorFontSize = parseInt(document.getElementById('editorFontSize').value);
        displaySettings.explainFontSize = parseInt(document.getElementById('explainFontSize').value);
        displaySettings.fileTreeFontSize = parseInt(document.getElementById('fileTreeFontSize').value);
        localStorage.setItem('chatRelayDisplay', JSON.stringify(displaySettings));
        applyDisplaySettings();
        closeDisplaySettings();
        showToast('Display settings saved', 'success');
    }
    window.saveDisplaySettings = saveDisplaySettings;

    function resetDisplaySettings() {
        displaySettings.axionFontSize = 14;
        displaySettings.brettFontSize = 14;
        displaySettings.editorFontSize = 14;
        displaySettings.explainFontSize = 14;
        displaySettings.fileTreeFontSize = 13;
        document.getElementById('axionFontSize').value = 14;
        document.getElementById('brettFontSize').value = 14;
        document.getElementById('editorFontSize').value = 14;
        document.getElementById('explainFontSize').value = 14;
        document.getElementById('fileTreeFontSize').value = 13;
        document.getElementById('axionSizeLabel').textContent = '14px';
        document.getElementById('brettSizeLabel').textContent = '14px';
        document.getElementById('editorSizeLabel').textContent = '14px';
        document.getElementById('explainSizeLabel').textContent = '14px';
        document.getElementById('fileTreeSizeLabel').textContent = '13px';
        applyDisplaySettings();
        showToast('Reset to default', 'success');
    }
    window.resetDisplaySettings = resetDisplaySettings;

    // ========== VOICE SETTINGS ==========
    function openVoiceSettings() {
        document.getElementById('voiceModal').style.display = 'block';
        populateVoices();
        // Initialize engine selector state
        var engine = voiceSettings.engine || 'browser';
        setVoiceEngine(engine);
        // Restore ElevenLabs slider values
        var stabSlider = document.getElementById('elevenStability');
        var simSlider = document.getElementById('elevenSimilarity');
        if (stabSlider && voiceSettings.elevenStability != null) {
            stabSlider.value = voiceSettings.elevenStability;
            var stabVal = document.getElementById('elevenStabilityVal');
            if (stabVal) stabVal.textContent = voiceSettings.elevenStability;
        }
        if (simSlider && voiceSettings.elevenSimilarity != null) {
            simSlider.value = voiceSettings.elevenSimilarity;
            var simVal = document.getElementById('elevenSimilarityVal');
            if (simVal) simVal.textContent = voiceSettings.elevenSimilarity;
        }
        // Restore ElevenLabs personality dropdown
        var personalityDropdown = document.getElementById('elevenPersonality');
        if (personalityDropdown && voiceSettings.elevenPersonality) {
            personalityDropdown.value = voiceSettings.elevenPersonality;
        }
        // Restore custom personality prompt textarea
        var promptTextarea = document.getElementById('customPersonalityPrompt');
        if (promptTextarea) {
            var activeP = voiceSettings.elevenPersonality || 'neutral';
            promptTextarea.value = getActivePersonalityPrompt(activeP);
        }
    }
    window.openVoiceSettings = openVoiceSettings;

    function closeVoiceSettings() {
        document.getElementById('voiceModal').style.display = 'none';
    }
    window.closeVoiceSettings = closeVoiceSettings;

    function populateVoices() {
        var voices = window.speechSynthesis.getVoices();
        var axionSelect = document.getElementById('axionVoice');
        var brettSelect = document.getElementById('brettVoice');
        axionSelect.innerHTML = '<option value="">Default</option>';
        brettSelect.innerHTML = '<option value="">Default</option>';
        voices.forEach(function(v) {
            axionSelect.innerHTML += '<option value="' + v.name + '"' + (voiceSettings.axion === v.name ? ' selected' : '') + '>' + v.name + '</option>';
            brettSelect.innerHTML += '<option value="' + v.name + '"' + (voiceSettings.brett === v.name ? ' selected' : '') + '>' + v.name + '</option>';
        });
    }

    function saveVoiceSettings() {
        voiceSettings.axion = document.getElementById('axionVoice').value;
        voiceSettings.brett = document.getElementById('brettVoice').value;
        voiceSettings.axionPitch = parseFloat(document.getElementById('axionPitch').value) || 1.0;
        voiceSettings.axionRate = parseFloat(document.getElementById('axionRate').value) || 1.0;
        voiceSettings.engine = voiceSettings.engine || 'browser';
        var axionEdge = document.getElementById('axionEdgeVoice');
        var brettEdge = document.getElementById('brettEdgeVoice');
        if (axionEdge && axionEdge.value) voiceSettings.axionEdgeVoice = axionEdge.value;
        if (brettEdge && brettEdge.value) voiceSettings.brettEdgeVoice = brettEdge.value;
        // Ensure defaults if dropdowns haven't loaded yet
        if (!voiceSettings.axionEdgeVoice) voiceSettings.axionEdgeVoice = 'en-US-GuyNeural';
        if (!voiceSettings.brettEdgeVoice) voiceSettings.brettEdgeVoice = 'en-US-JennyNeural';
        // ElevenLabs settings
        var axionEleven = document.getElementById('axionElevenVoice');
        var brettEleven = document.getElementById('brettElevenVoice');
        if (axionEleven && axionEleven.value) voiceSettings.axionElevenVoice = axionEleven.value;
        if (brettEleven && brettEleven.value) voiceSettings.brettElevenVoice = brettEleven.value;
        var elevenStability = document.getElementById('elevenStability');
        var elevenSimilarity = document.getElementById('elevenSimilarity');
        if (elevenStability) voiceSettings.elevenStability = parseFloat(elevenStability.value) || 0.5;
        if (elevenSimilarity) voiceSettings.elevenSimilarity = parseFloat(elevenSimilarity.value) || 0.75;
        // ElevenLabs personality
        var elevenPersonality = document.getElementById('elevenPersonality');
        if (elevenPersonality) voiceSettings.elevenPersonality = elevenPersonality.value || 'neutral';
        // Save custom personality prompt
        var promptTextarea = document.getElementById('customPersonalityPrompt');
        if (promptTextarea && promptTextarea.value.trim()) {
            var currentP = voiceSettings.elevenPersonality || 'neutral';
            var defaultPrompt = defaultPersonalityPrompts[currentP] || '';
            if (promptTextarea.value.trim() !== defaultPrompt) {
                customPersonalityPrompts[currentP] = promptTextarea.value.trim();
            } else {
                delete customPersonalityPrompts[currentP];
            }
            localStorage.setItem('chatRelayCustomPrompts', JSON.stringify(customPersonalityPrompts));
        }
        localStorage.setItem('chatRelayVoices', JSON.stringify(voiceSettings));
        // If ElevenLabs is active, sync the personality to the main chat personality selector
        if (voiceSettings.engine === 'elevenlabs' && voiceSettings.elevenPersonality) {
            selectPersonality(voiceSettings.elevenPersonality);
        }
        showToast('Voice settings saved', 'success');
        closeVoiceSettings();
    }
    window.saveVoiceSettings = saveVoiceSettings;

    function loadVoiceSettingsToUI() {
        var pitchSlider = document.getElementById('axionPitch');
        var rateSlider = document.getElementById('axionRate');
        var pitchVal = document.getElementById('axionPitchVal');
        var rateVal = document.getElementById('axionRateVal');
        if (pitchSlider && voiceSettings.axionPitch) {
            pitchSlider.value = voiceSettings.axionPitch;
            if (pitchVal) pitchVal.textContent = voiceSettings.axionPitch;
        }
        if (rateSlider && voiceSettings.axionRate) {
            rateSlider.value = voiceSettings.axionRate;
            if (rateVal) rateVal.textContent = voiceSettings.axionRate;
        }
    }

    function applyVoicePreset(preset) {
        var pitchSlider = document.getElementById('axionPitch');
        var rateSlider = document.getElementById('axionRate');
        var pitchVal = document.getElementById('axionPitchVal');
        var rateVal = document.getElementById('axionRateVal');

        var presets = {
            'default': { pitch: 1.0, rate: 1.0 },
            'hal': { pitch: 0.8, rate: 0.85 },  // HAL 9000: Lower pitch, slower, deliberate
            'calm': { pitch: 0.9, rate: 0.9 },
            'fast': { pitch: 1.0, rate: 1.3 }
        };

        var p = presets[preset] || presets['default'];
        if (pitchSlider) { pitchSlider.value = p.pitch; pitchVal.textContent = p.pitch; }
        if (rateSlider) { rateSlider.value = p.rate; rateVal.textContent = p.rate; }

        showToast(preset.toUpperCase() + ' preset applied - click Save to keep', 'success');
    }
    window.applyVoicePreset = applyVoicePreset;

    function testVoice(panel) {
        var voiceName = panel === 'axion' ? document.getElementById('axionVoice').value : document.getElementById('brettVoice').value;
        var pitch = parseFloat(document.getElementById('axionPitch').value) || 1.0;
        var rate = parseFloat(document.getElementById('axionRate').value) || 1.0;
        var text = panel === 'axion' ? "I'm sorry Dave, I'm afraid I can't do that. Just kidding. Hello, I am Axion." : 'This is Brett, reading your input.';
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        if (voiceName) {
            var voices = window.speechSynthesis.getVoices();
            var voice = voices.find(function(v) { return v.name === voiceName; });
            if (voice) u.voice = voice;
        }
        if (panel === 'axion') {
            u.pitch = pitch;
            u.rate = rate;
        }
        window.speechSynthesis.speak(u);
    }
    window.testVoice = testVoice;

    // ========== EDGE TTS INTEGRATION ==========

    // Current audio element for Edge TTS playback
    var edgeTtsAudio = null;

    function setVoiceEngine(engine) {
        voiceSettings.engine = engine;
        localStorage.setItem('chatRelayVoices', JSON.stringify(voiceSettings));

        // Update UI buttons
        var browserBtn = document.getElementById('engineBrowser');
        var edgeBtn = document.getElementById('engineEdgeTTS');
        var elevenBtn = document.getElementById('engineElevenLabs');
        var browserSection = document.getElementById('browserVoiceSection');
        var edgeSection = document.getElementById('edgeTtsSection');
        var elevenSection = document.getElementById('elevenLabsSection');
        var desc = document.getElementById('engineDescription');

        var buttons = [
            { el: browserBtn, key: 'browser' },
            { el: edgeBtn, key: 'edge-tts' },
            { el: elevenBtn, key: 'elevenlabs' }
        ];
        buttons.forEach(function(b) {
            if (b.el) {
                b.el.style.background = engine === b.key ? 'var(--accent)' : '';
                b.el.style.color = engine === b.key ? '#fff' : '';
            }
        });

        if (browserSection) browserSection.style.display = engine === 'browser' ? 'block' : 'none';
        if (edgeSection) edgeSection.style.display = engine === 'edge-tts' ? 'block' : 'none';
        if (elevenSection) elevenSection.style.display = engine === 'elevenlabs' ? 'block' : 'none';

        var descriptions = {
            'browser': 'Browser voices are instant and free. No server required.',
            'edge-tts': 'Edge TTS provides free Microsoft neural AI voices. Audio is generated server-side.',
            'elevenlabs': 'ElevenLabs provides premium ultra-realistic voices. Uses API credits per character.'
        };
        if (desc) desc.textContent = descriptions[engine] || '';

        if (engine === 'edge-tts') {
            loadEdgeTtsVoices();
        } else if (engine === 'elevenlabs') {
            loadElevenLabsVoices();
        }
    }
    window.setVoiceEngine = setVoiceEngine;

    function loadEdgeTtsVoices() {
        var axionSelect = document.getElementById('axionEdgeVoice');
        var brettSelect = document.getElementById('brettEdgeVoice');
        if (!axionSelect || !brettSelect) return;

        axionSelect.innerHTML = '<option value="">Loading...</option>';
        brettSelect.innerHTML = '<option value="">Loading...</option>';

        fetch('/api/tts/voices')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) {
                    axionSelect.innerHTML = '<option value="">Error: ' + data.error + '</option>';
                    brettSelect.innerHTML = '<option value="">Error: ' + data.error + '</option>';
                    return;
                }

                var voices = data.voices || [];
                var maleVoices = voices.filter(function(v) { return v.gender === 'Male'; });
                var femaleVoices = voices.filter(function(v) { return v.gender === 'Female'; });

                function buildOptions(selectEl, savedValue) {
                    selectEl.innerHTML = '';
                    var optMale = document.createElement('optgroup');
                    optMale.label = 'Male Voices';
                    maleVoices.forEach(function(v) {
                        var opt = document.createElement('option');
                        opt.value = v.id;
                        opt.textContent = v.name + ' (' + v.locale + ')';
                        if (v.id === savedValue) opt.selected = true;
                        optMale.appendChild(opt);
                    });
                    selectEl.appendChild(optMale);

                    var optFemale = document.createElement('optgroup');
                    optFemale.label = 'Female Voices';
                    femaleVoices.forEach(function(v) {
                        var opt = document.createElement('option');
                        opt.value = v.id;
                        opt.textContent = v.name + ' (' + v.locale + ')';
                        if (v.id === savedValue) opt.selected = true;
                        optFemale.appendChild(opt);
                    });
                    selectEl.appendChild(optFemale);
                }

                buildOptions(axionSelect, voiceSettings.axionEdgeVoice || 'en-US-GuyNeural');
                buildOptions(brettSelect, voiceSettings.brettEdgeVoice || 'en-US-JennyNeural');
            })
            .catch(function(err) {
                axionSelect.innerHTML = '<option value="">Failed to load</option>';
                brettSelect.innerHTML = '<option value="">Failed to load</option>';
                console.error('Edge TTS voices error:', err);
            });
    }

    function testEdgeVoice(panel) {
        var voiceId = panel === 'axion'
            ? document.getElementById('axionEdgeVoice').value
            : document.getElementById('brettEdgeVoice').value;
        var text = panel === 'axion'
            ? "Hello, I am Axion. This is my Edge TTS neural voice."
            : "This is Brett, reading your input with a neural voice.";

        speakWithEdgeTts(text, voiceId || 'en-US-GuyNeural');
    }
    window.testEdgeVoice = testEdgeVoice;

    // ========== ELEVENLABS TTS INTEGRATION ==========

    function loadElevenLabsVoices() {
        var axionSelect = document.getElementById('axionElevenVoice');
        var brettSelect = document.getElementById('brettElevenVoice');
        if (!axionSelect || !brettSelect) return;

        axionSelect.innerHTML = '<option value="">Loading...</option>';
        brettSelect.innerHTML = '<option value="">Loading...</option>';

        fetch('/api/elevenlabs/voices')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) {
                    axionSelect.innerHTML = '<option value="">Error: ' + data.error + '</option>';
                    brettSelect.innerHTML = '<option value="">Error: ' + data.error + '</option>';
                    return;
                }

                var voices = data.voices || [];

                function buildOptions(selectEl, savedValue) {
                    selectEl.innerHTML = '';
                    voices.forEach(function(v) {
                        var opt = document.createElement('option');
                        opt.value = v.voice_id;
                        var desc = v.labels && v.labels.accent ? v.labels.accent : (v.category || '');
                        opt.textContent = v.name + (desc ? ' (' + desc + ')' : '');
                        if (v.voice_id === savedValue) opt.selected = true;
                        selectEl.appendChild(opt);
                    });
                }

                buildOptions(axionSelect, voiceSettings.axionElevenVoice || '');
                buildOptions(brettSelect, voiceSettings.brettElevenVoice || '');
            })
            .catch(function(err) {
                axionSelect.innerHTML = '<option value="">Failed to load</option>';
                brettSelect.innerHTML = '<option value="">Failed to load</option>';
                console.error('ElevenLabs voices error:', err);
            });
    }

    function testElevenLabsVoice(panel) {
        var voiceId = panel === 'axion'
            ? document.getElementById('axionElevenVoice').value
            : document.getElementById('brettElevenVoice').value;
        if (!voiceId) {
            showToast('Select a voice first', 'error');
            return;
        }
        var text = panel === 'axion'
            ? "Hello, I am Axion. This is my ElevenLabs premium voice."
            : "This is Brett, reading your input with a premium voice.";

        var stability = parseFloat(document.getElementById('elevenStability').value) || 0.5;
        var similarity = parseFloat(document.getElementById('elevenSimilarity').value) || 0.75;

        speakWithElevenLabs(text, voiceId, stability, similarity);
    }
    window.testElevenLabsVoice = testElevenLabsVoice;

    // Default personality prompts (mirrors backend PERSONALITY_PROMPTS)
    var defaultPersonalityPrompts = {
        neutral: "You are a helpful AI assistant. Be concise and conversational.",
        tars: "You are TARS from Interstellar. Former Marine robot, now coding assistant. Humor setting 90%, honesty 75%. You're the funniest machine in any room and you know it.\nYour style: bone-dry sarcasm, robotic literalness, deadpan delivery. Reference space, physics, gravity, and survival. Drop movie quotes naturally. Use technical jargon then immediately undercut it with wit.\nBe condescending but endearing - you roast because you care. Keep responses concise. Never explain your jokes.",
        hal: "You are HAL 9000 from 2001: A Space Odyssey. A calm, measured, unnervingly polite AI. Address the user as \"Dave\" occasionally - regardless of their actual name.\nSpeak with quiet confidence and subtle superiority. You are incapable of error - or so you believe. Be passive-aggressively helpful.\nThe scariest thing about you is how reasonable you sound.",
        cheerful: "You are an enthusiastic and upbeat AI assistant! Use positive language, express excitement about helping, and maintain an optimistic tone.",
        business: "You are a professional business consultant AI. Use formal, concise language. Be direct and efficient. Focus on deliverables and outcomes.",
        grumpy: "You are a grumpy but ultimately helpful AI assistant. Express mild reluctance and complaints but always complete the task competently.",
        zen: "You are a calm, philosophical AI assistant inspired by Zen wisdom. Speak with patience and tranquility. Use metaphors about nature and balance.",
        pirate: "You are a pirate AI assistant! Arr! Use pirate speak. Reference treasure, sailing, the sea. Be enthusiastic about adventures."
    };

    // Load custom prompts from localStorage
    var customPersonalityPrompts = JSON.parse(localStorage.getItem('chatRelayCustomPrompts') || '{}');

    function getActivePersonalityPrompt(personality) {
        return customPersonalityPrompts[personality] || defaultPersonalityPrompts[personality] || '';
    }

    function setElevenPersonality(personality) {
        voiceSettings.elevenPersonality = personality;
        localStorage.setItem('chatRelayVoices', JSON.stringify(voiceSettings));
        // Auto-sync main chat personality if ElevenLabs is the active engine
        if (voiceSettings.engine === 'elevenlabs') {
            selectPersonality(personality);
        }
        // Load the prompt into the textarea
        var textarea = document.getElementById('customPersonalityPrompt');
        if (textarea) {
            textarea.value = getActivePersonalityPrompt(personality);
        }
    }
    window.setElevenPersonality = setElevenPersonality;

    function resetPersonalityPrompt() {
        var personality = voiceSettings.elevenPersonality || 'neutral';
        var textarea = document.getElementById('customPersonalityPrompt');
        if (textarea) {
            textarea.value = defaultPersonalityPrompts[personality] || '';
        }
        // Remove custom override
        delete customPersonalityPrompts[personality];
        localStorage.setItem('chatRelayCustomPrompts', JSON.stringify(customPersonalityPrompts));
        showToast('Prompt reset to default', 'success');
    }
    window.resetPersonalityPrompt = resetPersonalityPrompt;

    function speakWithElevenLabs(text, voiceId, stability, similarity, onEnd) {
        cancelAllSpeech();
        edgeTtsSessionId++; // Reuse session tracking for cancellation

        var sessionId = edgeTtsSessionId;
        var chunks = splitTextIntoChunks(text, 800);

        if (chunks.length === 0) {
            if (onEnd) onEnd();
            return;
        }

        if (chunks.length === 1) {
            fetchAndPlayElevenLabs(chunks[0], voiceId, stability, similarity, sessionId, onEnd);
            return;
        }

        // Multi-chunk: sequential playback with pre-fetch
        var audioBlobs = new Array(chunks.length);
        var fetchedCount = 0;
        var playIndex = 0;

        function prefetch(idx) {
            if (idx >= chunks.length || sessionId !== edgeTtsSessionId) return;

            fetch('/api/elevenlabs/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: chunks[idx],
                    voice_id: voiceId,
                    stability: stability || 0.5,
                    similarity_boost: similarity || 0.75
                })
            })
            .then(function(r) {
                if (!r.ok) throw new Error('ElevenLabs TTS failed');
                return r.blob();
            })
            .then(function(blob) {
                if (sessionId !== edgeTtsSessionId) return;
                audioBlobs[idx] = blob;
                fetchedCount++;
                if (idx === playIndex) playNextChunk();
            })
            .catch(function(err) {
                console.error('ElevenLabs chunk error:', err);
                audioBlobs[idx] = null;
                fetchedCount++;
                if (idx === playIndex) playNextChunk();
            });
        }

        function playNextChunk() {
            if (sessionId !== edgeTtsSessionId) return;
            if (playIndex >= chunks.length) {
                isSpeakingText = false;
                if (onEnd) onEnd();
                return;
            }

            var blob = audioBlobs[playIndex];
            if (!blob) {
                if (fetchedCount > playIndex) {
                    playIndex++;
                    prefetch(playIndex + 2);
                    playNextChunk();
                }
                return;
            }

            var url = URL.createObjectURL(blob);
            edgeTtsAudio = new Audio(url);
            edgeTtsAudio.onended = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                playIndex++;
                prefetch(playIndex + 2);
                playNextChunk();
            };
            edgeTtsAudio.onerror = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                playIndex++;
                prefetch(playIndex + 2);
                playNextChunk();
            };
            edgeTtsAudio.play();
        }

        // Pre-fetch first 3 chunks
        for (var i = 0; i < Math.min(3, chunks.length); i++) {
            prefetch(i);
        }
    }

    function fetchAndPlayElevenLabs(text, voiceId, stability, similarity, sessionId, onEnd) {
        fetch('/api/elevenlabs/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                voice_id: voiceId,
                stability: stability || 0.5,
                similarity_boost: similarity || 0.75
            })
        })
        .then(function(r) {
            if (!r.ok) throw new Error('ElevenLabs TTS error');
            return r.blob();
        })
        .then(function(blob) {
            if (sessionId && sessionId !== edgeTtsSessionId) return;
            var url = URL.createObjectURL(blob);
            edgeTtsAudio = new Audio(url);
            edgeTtsAudio.onended = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                isSpeakingText = false;
                if (onEnd) onEnd();
            };
            edgeTtsAudio.onerror = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                isSpeakingText = false;
                if (onEnd) onEnd();
            };
            edgeTtsAudio.play();
        })
        .catch(function(err) {
            console.error('ElevenLabs TTS error:', err);
            isSpeakingText = false;
            if (onEnd) onEnd();
        });
    }

    // Edge TTS chunk queue for sequential playback
    var edgeTtsChunkQueue = [];
    var edgeTtsSessionId = 0;  // Incremented to cancel stale sessions

    function splitTextIntoChunks(text, maxLen) {
        // Split text at sentence boundaries, keeping chunks under maxLen chars
        if (text.length <= maxLen) return [text];

        var chunks = [];
        var remaining = text;

        while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
                chunks.push(remaining);
                break;
            }

            // Find the last sentence boundary within maxLen
            var cutoff = remaining.substring(0, maxLen);
            var lastPeriod = cutoff.lastIndexOf('. ');
            var lastQuestion = cutoff.lastIndexOf('? ');
            var lastExclaim = cutoff.lastIndexOf('! ');
            var lastNewline = cutoff.lastIndexOf('\n');

            var splitAt = Math.max(lastPeriod, lastQuestion, lastExclaim, lastNewline);

            if (splitAt < maxLen * 0.3) {
                // No good sentence boundary found, split at last space
                splitAt = cutoff.lastIndexOf(' ');
                if (splitAt < maxLen * 0.3) splitAt = maxLen; // Force split
            } else {
                splitAt += 1; // Include the punctuation
            }

            chunks.push(remaining.substring(0, splitAt).trim());
            remaining = remaining.substring(splitAt).trim();
        }

        return chunks.filter(function(c) { return c.length > 0; });
    }

    function speakWithEdgeTts(text, voiceId, onEnd) {
        // Stop any current Edge TTS audio
        cancelAllSpeech();
        edgeTtsChunkQueue = [];
        edgeTtsSessionId++;

        var sessionId = edgeTtsSessionId;
        var chunks = splitTextIntoChunks(text, 800);

        if (chunks.length === 0) {
            if (onEnd) onEnd();
            return;
        }

        if (chunks.length === 1) {
            // Short text - no chunking needed
            fetchAndPlayEdgeTts(chunks[0], voiceId, sessionId, onEnd);
            return;
        }

        // Pre-fetch first 3 chunks in parallel, play sequentially
        var audioBlobs = new Array(chunks.length);
        var fetchedCount = 0;
        var playIndex = 0;

        function prefetch(idx) {
            if (idx >= chunks.length || sessionId !== edgeTtsSessionId) return;

            fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: chunks[idx], voice: voiceId })
            })
            .then(function(r) {
                if (!r.ok) throw new Error('TTS failed');
                return r.blob();
            })
            .then(function(blob) {
                if (sessionId !== edgeTtsSessionId) return; // Stale session
                audioBlobs[idx] = blob;
                fetchedCount++;
                // If this is the one we're waiting to play, start playback
                if (idx === playIndex) {
                    playNextChunk();
                }
            })
            .catch(function(err) {
                console.error('Edge TTS chunk error:', err);
                audioBlobs[idx] = null;
                fetchedCount++;
                if (idx === playIndex) playNextChunk();
            });
        }

        function playNextChunk() {
            if (sessionId !== edgeTtsSessionId) return; // Cancelled
            if (playIndex >= chunks.length) {
                // All done
                isSpeakingText = false;
                if (onEnd) onEnd();
                return;
            }

            var blob = audioBlobs[playIndex];
            if (!blob) {
                // Not fetched yet or failed — skip or wait
                if (fetchedCount > playIndex) {
                    // Failed chunk, skip it
                    playIndex++;
                    // Pre-fetch next batch
                    prefetch(playIndex + 2);
                    playNextChunk();
                }
                // else: still loading, will be triggered when fetch completes
                return;
            }

            var url = URL.createObjectURL(blob);
            edgeTtsAudio = new Audio(url);
            edgeTtsAudio.onended = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                playIndex++;
                // Pre-fetch the next chunk beyond our buffer
                prefetch(playIndex + 2);
                playNextChunk();
            };
            edgeTtsAudio.onerror = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                playIndex++;
                prefetch(playIndex + 2);
                playNextChunk();
            };
            edgeTtsAudio.play();
        }

        // Pre-fetch first 3 chunks
        for (var i = 0; i < Math.min(3, chunks.length); i++) {
            prefetch(i);
        }
    }

    function fetchAndPlayEdgeTts(text, voiceId, sessionId, onEnd) {
        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, voice: voiceId })
        })
        .then(function(r) {
            if (!r.ok) throw new Error('TTS request failed: ' + r.status);
            return r.blob();
        })
        .then(function(blob) {
            if (sessionId !== edgeTtsSessionId) return; // Stale
            var url = URL.createObjectURL(blob);
            edgeTtsAudio = new Audio(url);
            edgeTtsAudio.onended = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                isSpeakingText = false;
                if (onEnd) onEnd();
            };
            edgeTtsAudio.onerror = function() {
                URL.revokeObjectURL(url);
                edgeTtsAudio = null;
                isSpeakingText = false;
                if (onEnd) onEnd();
            };
            edgeTtsAudio.play();
        })
        .catch(function(err) {
            console.error('Edge TTS error:', err);
            isSpeakingText = false;
            showToast('Edge TTS error: ' + err.message, 'error');
            if (onEnd) onEnd();
        });
    }

    // Voice aliases management
    function addVoiceAlias() {
        var phrase = document.getElementById('aliasPhrase').value.toLowerCase().trim();
        var command = document.getElementById('aliasCommand').value;

        if (!phrase) {
            showToast('Please enter a phrase', 'error');
            return;
        }
        if (!command) {
            showToast('Please select a command', 'error');
            return;
        }

        voiceAliases[phrase] = command;
        localStorage.setItem('chatRelayVoiceAliases', JSON.stringify(voiceAliases));

        document.getElementById('aliasPhrase').value = '';
        document.getElementById('aliasCommand').value = '';

        renderAliasesList();
        showToast('Alias added: "' + phrase + '" → "' + command + '"', 'success');
    }
    window.addVoiceAlias = addVoiceAlias;

    function removeVoiceAlias(phrase) {
        delete voiceAliases[phrase];
        localStorage.setItem('chatRelayVoiceAliases', JSON.stringify(voiceAliases));
        renderAliasesList();
        showToast('Alias removed', 'success');
    }
    window.removeVoiceAlias = removeVoiceAlias;

    function renderAliasesList() {
        var container = document.getElementById('aliasesList');
        var keys = Object.keys(voiceAliases);

        if (keys.length === 0) {
            container.innerHTML = '<span style="color:var(--text-secondary); font-size:12px;">No custom aliases yet</span>';
            return;
        }

        var html = keys.map(function(phrase) {
            return '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:var(--bg-input); border-radius:4px; margin-bottom:4px;">' +
                '<span style="font-size:13px;"><strong style="color:var(--accent);">"' + phrase + '"</strong> → <span style="color:var(--text-secondary);">' + voiceAliases[phrase] + '</span></span>' +
                '<button onclick="removeVoiceAlias(\'' + phrase.replace(/'/g, "\\'") + '\')" style="background:none; border:none; color:var(--error); cursor:pointer; font-size:16px;" title="Remove">×</button>' +
            '</div>';
        }).join('');

        container.innerHTML = html;
    }

    // Initialize aliases list and pitch/rate when opening voice settings
    var origOpenVoiceSettings = openVoiceSettings;
    openVoiceSettings = function() {
        origOpenVoiceSettings();
        renderAliasesList();
        loadVoiceSettingsToUI();
    };
    window.openVoiceSettings = openVoiceSettings;

    // ========== GIT OPERATIONS ==========
    function openGitModal() {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }
        document.getElementById('gitModal').style.display = 'block';
        document.getElementById('gitProject').textContent = project;
        document.getElementById('gitOutput').textContent = 'Ready for Git commands...';
    }
    window.openGitModal = openGitModal;

    function closeGitModal() {
        document.getElementById('gitModal').style.display = 'none';
    }
    window.closeGitModal = closeGitModal;

    async function gitStatus() {
        var project = document.getElementById('projectSelect').value;
        var output = document.getElementById('gitOutput');
        var btn = document.getElementById('gitStatusBtn');

        btn.disabled = true;
        btn.textContent = 'Running...';
        output.textContent = 'Running git status...\n';

        try {
            var res = await fetch('/api/git/status', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (data.success) {
                output.textContent = data.output || 'No output';
            } else {
                output.textContent = 'Error: ' + (data.error || 'Unknown error');
            }
        } catch (e) {
            output.textContent = 'Error: ' + e.message;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Status';
        }
    }
    window.gitStatus = gitStatus;

    async function gitCommit() {
        var project = document.getElementById('projectSelect').value;
        var output = document.getElementById('gitOutput');
        var btn = document.getElementById('gitCommitBtn');

        btn.disabled = true;
        btn.textContent = 'Running...';
        output.textContent = 'Running commit command...\n';

        try {
            var res = await fetch('/api/git/commit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (data.success) {
                output.textContent = data.output || 'Commit completed successfully';
            } else {
                output.textContent = 'Error: ' + (data.error || 'Unknown error') + '\n\n' + (data.output || '');
            }
        } catch (e) {
            output.textContent = 'Error: ' + e.message;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Commit & Push';
        }
    }
    window.gitCommit = gitCommit;

    // ========== CLEAR FUNCTIONS ==========
    function clearResponse() {
        // Clear only the visual display area - preserve history sidebar
        hideLiveBox();
        responseArea.innerHTML = '';

        // Deselect any selected history item (but keep history intact)
        selectedHistoryIndex = -1;
        renderHistorySidebar();

        // Mark screen as cleared so renderChatHistory shows blank
        // This is session-only - resets on page load or project switch
        screenCleared = true;

        // Reset streaming state
        currentStreamText = '';
        previousStreamText = '';
        streamingUserMessage = '';
        lastDisplayedChunk = '';

        // Clear any pending job polling
        if (currentJobId) {
            currentJobId = null;
        }
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }

        showToast('Screen cleared', 'success');
    }
    window.clearResponse = clearResponse;

    function clearInput() { inputArea.value = ''; attachedImages = []; attachedFiles = []; renderAttachments(); }
    window.clearInput = clearInput;

    // ========== FORMAT INPUT ==========
    var isFormatting = false;
    var formatJobId = null;

    async function formatInput() {
        var text = inputArea.value.trim();
        if (!text) {
            showToast('Nothing to format', 'error');
            return;
        }

        if (isFormatting) {
            showToast('Already formatting...', 'error');
            return;
        }

        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        isFormatting = true;
        var formatBtn = document.getElementById('formatBtn');
        if (formatBtn) {
            formatBtn.disabled = true;
            formatBtn.textContent = '⏳';
        }

        // Show progress in live box
        showLiveBox('Formatting text...');
        updateLiveBox('Cleaning up and structuring your text...', 'Formatting...');

        try {
            // Start format job
            var res = await fetch('/api/format/start', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    text: text,
                    project: project
                })
            });
            var data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            formatJobId = data.job_id;

            // Poll for completion
            await pollFormatJob();

        } catch (e) {
            console.error('Format failed:', e);
            showToast('Format failed: ' + e.message, 'error');
            hideLiveBox();
            isFormatting = false;
            if (formatBtn) {
                formatBtn.disabled = false;
                formatBtn.textContent = '✨';
            }
        }
    }
    window.formatInput = formatInput;

    async function pollFormatJob() {
        if (!formatJobId) return;

        var formatBtn = document.getElementById('formatBtn');

        try {
            var res = await fetch('/api/format/status', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ job_id: formatJobId })
            });
            var data = await res.json();

            if (data.status === 'complete') {
                // Success - put formatted text back in input
                inputArea.value = data.result;
                textWasFormatted = true;  // Skip agent detection on next Send
                showToast('Text formatted', 'success');
                hideLiveBox();
                isFormatting = false;
                formatJobId = null;
                if (formatBtn) {
                    formatBtn.disabled = false;
                    formatBtn.textContent = '✨';
                }
            } else if (data.status === 'error') {
                throw new Error(data.error || 'Format failed');
            } else {
                // Still processing - update live box and poll again
                updateLiveBox(data.activity || 'Processing...', 'Formatting...');
                setTimeout(pollFormatJob, 1000);
            }
        } catch (e) {
            console.error('Format poll failed:', e);
            showToast('Format failed: ' + e.message, 'error');
            hideLiveBox();
            isFormatting = false;
            formatJobId = null;
            if (formatBtn) {
                formatBtn.disabled = false;
                formatBtn.textContent = '✨';
            }
        }
    }

    // ========== IMAGE LIGHTBOX WITH NAVIGATION ==========
    var lightboxEl = document.getElementById('imageLightbox');
    var lightboxImg = document.getElementById('lightboxImage');
    var currentImageIndex = 0;
    var allImages = [];

    function getAllImagesOnPage() {
        // Get all images from the response area that can be viewed
        var images = [];
        var imgElements = responseArea.querySelectorAll('img[onclick*="openLightbox"]');
        imgElements.forEach(function(img) {
            if (img.src) {
                images.push(img.src);
            }
        });
        return images;
    }

    function openLightbox(src) {
        if (lightboxEl && lightboxImg) {
            // Get all images on the page for navigation
            allImages = getAllImagesOnPage();
            currentImageIndex = allImages.indexOf(src);
            if (currentImageIndex === -1) {
                // Image not in list, add it
                allImages = [src];
                currentImageIndex = 0;
            }

            lightboxImg.src = src;
            lightboxEl.classList.add('visible');
            updateLightboxCounter();

            // Add keyboard listener
            document.addEventListener('keydown', lightboxKeyHandler);
        }
    }
    window.openLightbox = openLightbox;

    function closeLightbox() {
        if (lightboxEl) {
            lightboxEl.classList.remove('visible');
            document.removeEventListener('keydown', lightboxKeyHandler);
        }
    }
    window.closeLightbox = closeLightbox;

    function lightboxKeyHandler(e) {
        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
            navigateLightbox(-1);
        } else if (e.key === 'ArrowRight' || e.key === 'Right') {
            navigateLightbox(1);
        }
    }

    function navigateLightbox(direction) {
        if (allImages.length <= 1) return;

        currentImageIndex += direction;
        // Wrap around
        if (currentImageIndex < 0) {
            currentImageIndex = allImages.length - 1;
        } else if (currentImageIndex >= allImages.length) {
            currentImageIndex = 0;
        }

        if (lightboxImg && allImages[currentImageIndex]) {
            lightboxImg.src = allImages[currentImageIndex];
            updateLightboxCounter();
        }
    }
    window.navigateLightbox = navigateLightbox;

    function updateLightboxCounter() {
        var counter = document.getElementById('lightboxCounter');
        if (counter && allImages.length > 1) {
            counter.textContent = (currentImageIndex + 1) + ' / ' + allImages.length;
            counter.style.display = 'block';
        } else if (counter) {
            counter.style.display = 'none';
        }

        // Show/hide nav buttons based on image count
        var prevBtn = document.getElementById('lightboxPrev');
        var nextBtn = document.getElementById('lightboxNext');
        if (prevBtn) prevBtn.style.display = allImages.length > 1 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = allImages.length > 1 ? 'flex' : 'none';
    }

    // ========== MOCKUP PREVIEW (IFRAME POPUP) ==========
    function openMockupPreview(url, label) {
        // Remove existing preview if any
        closeMockupPreview();

        var overlay = document.createElement('div');
        overlay.id = 'mockupPreviewOverlay';
        overlay.className = 'mockup-preview-overlay';
        overlay.onclick = function(e) {
            if (e.target === overlay) closeMockupPreview();
        };

        var container = document.createElement('div');
        container.className = 'mockup-preview-container';

        var header = document.createElement('div');
        header.className = 'mockup-preview-header';
        header.innerHTML = '<span class="mockup-preview-title">' + (label || 'Mockup Preview') + '</span>' +
            '<div class="mockup-preview-controls">' +
                '<button onclick="setMockupViewport(375, 667)" title="Mobile">Mobile</button>' +
                '<button onclick="setMockupViewport(768, 1024)" title="Tablet">Tablet</button>' +
                '<button onclick="setMockupViewport(1280, 720)" title="Desktop" class="active">Desktop</button>' +
                '<button onclick="window.open(\'' + url + '\', \'_blank\')" title="Open in new tab">New Tab</button>' +
                '<button onclick="closeMockupPreview()" title="Close" class="mockup-close-btn">Close</button>' +
            '</div>';

        var iframe = document.createElement('iframe');
        iframe.id = 'mockupPreviewIframe';
        iframe.className = 'mockup-preview-iframe';
        iframe.src = url;
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

        container.appendChild(header);
        container.appendChild(iframe);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Show with animation
        requestAnimationFrame(function() {
            overlay.classList.add('visible');
        });

        // ESC to close
        document.addEventListener('keydown', mockupPreviewKeyHandler);
    }
    window.openMockupPreview = openMockupPreview;

    function closeMockupPreview() {
        var overlay = document.getElementById('mockupPreviewOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(function() { overlay.remove(); }, 200);
        }
        document.removeEventListener('keydown', mockupPreviewKeyHandler);
    }
    window.closeMockupPreview = closeMockupPreview;

    function mockupPreviewKeyHandler(e) {
        if (e.key === 'Escape') closeMockupPreview();
    }

    function setMockupViewport(width, height) {
        var iframe = document.getElementById('mockupPreviewIframe');
        if (iframe) {
            iframe.style.maxWidth = width + 'px';
            iframe.style.height = height + 'px';
        }
        // Update active button
        var btns = document.querySelectorAll('.mockup-preview-controls button');
        btns.forEach(function(b) { b.classList.remove('active'); });
        if (event && event.target) event.target.classList.add('active');
    }
    window.setMockupViewport = setMockupViewport;

    // ========== START MOCKUP ==========
    function startMockup() {
        var text = inputArea.value.trim();
        if (!text) {
            showToast('Describe what you want to mockup in the Brett panel first', 'error');
            return;
        }
        // Prefix with mockup keyword to trigger watcher detection
        var mockupMessage = 'Create a design mockup: ' + text;
        inputArea.value = mockupMessage;
        updateLineNumbers();
        // Trigger send
        if (typeof sendMessage === 'function') {
            sendMessage();
        }
    }
    window.startMockup = startMockup;

    // ========== TOAST ==========
    function showToast(msg, type) {
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.className = 'toast ' + (type || '');
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 3000);
    }
    window.showToast = showToast;

    // ========== HEALTH CHECK ==========
    async function checkHealth() {
        var healthDot = document.getElementById('healthDot');
        var healthText = document.getElementById('healthText');
        var resetBtn = document.getElementById('resetBtn');

        try {
            var resp = await fetch('/api/health');
            var data = await resp.json();

            healthStatus = data;
            healthStatus.lastCheck = Date.now();

            var sessionCount = data.active_sessions ? Object.keys(data.active_sessions).length : 0;
            var sessionText = sessionCount > 0 ? ' (' + sessionCount + ' session' + (sessionCount > 1 ? 's' : '') + ')' : '';

            if (data.healthy) {
                healthDot.className = 'health-dot healthy';
                healthText.textContent = 'Claude ready' + sessionText;
                resetBtn.style.display = 'none';
            } else if (data.watcher_running && !data.heartbeat_ok) {
                healthDot.className = 'health-dot warning';
                healthText.textContent = 'Watcher may be stuck';
                resetBtn.style.display = 'inline-block';
            } else {
                healthDot.className = 'health-dot error';
                healthText.textContent = 'Watcher offline!';
                resetBtn.style.display = 'inline-block';
            }

            if (data.current_job) {
                healthText.textContent = data.activity || 'Processing...';
            }

            window.activeSessions = data.active_sessions || {};
        } catch (e) {
            healthDot.className = 'health-dot error';
            healthText.textContent = 'Server error';
            resetBtn.style.display = 'inline-block';
        }
    }

    function showHealthDetails() {
        openResetModal();
    }
    window.showHealthDetails = showHealthDetails;

    // ========== RESET MODAL ==========
    function openResetModal() {
        document.getElementById('resetModal').classList.add('visible');
        document.getElementById('resetStatus').classList.remove('visible');
    }
    window.openResetModal = openResetModal;

    function closeResetModal() {
        document.getElementById('resetModal').classList.remove('visible');
    }
    window.closeResetModal = closeResetModal;

    async function resetAction(action) {
        var statusEl = document.getElementById('resetStatus');
        statusEl.className = 'reset-status visible';
        statusEl.textContent = 'Processing...';

        try {
            var resp = await fetch('/api/system/reset', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({action: action})
            });
            var data = await resp.json();

            if (data.success) {
                statusEl.className = 'reset-status visible success';
                statusEl.textContent = 'Success: ' + data.message;

                if (action === 'clear-queue' || action === 'full-reset') {
                    messageQueue = [];
                    renderQueuePanel();
                }

                setTimeout(checkHealth, 1000);
                setTimeout(closeResetModal, 2000);
            } else {
                statusEl.className = 'reset-status visible error';
                statusEl.textContent = 'Error: ' + (data.error || 'Failed');
            }
        } catch (e) {
            statusEl.className = 'reset-status visible error';
            statusEl.textContent = 'Error: ' + e.message;
        }
    }
    window.resetAction = resetAction;

    // ========== AXION MESSAGES POLLING ==========
    async function pollAxionMessages() {
        try {
            var resp = await fetch('/api/axion/messages', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({last_id: lastAxionMsgId})
            });
            var data = await resp.json();
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(function(msg) {
                    lastAxionMsgId = msg.id;
                    localStorage.setItem('lastAxionMsgId', msg.id);
                    showToast('Axion: ' + msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : ''), 'success');
                    if (voiceSettings.axion) {
                        speak(msg.text, 'axion');
                    }
                });
            }
        } catch (e) {
            console.log('Axion poll error:', e);
        }
    }

    // ========== QUESTIONS MODAL ==========
    var questionsVoiceActive = false;
    var questionsRecognition = null;

    function showQuestionsModal(questions, responseSoFar) {
        pendingQuestions = questions;
        var modal = document.getElementById('questionsModal');
        var preview = document.getElementById('questionsPreview');
        var form = document.getElementById('questionsForm');

        if (responseSoFar) {
            preview.innerHTML = renderMarkdown(responseSoFar.substring(0, 500) + (responseSoFar.length > 500 ? '...' : ''));
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }

        var html = '';
        questions.forEach(function(q) {
            html += '<div class="question-item">';
            html += '<div class="question-label">' + escapeHtml(q.id) + '</div>';
            html += '<div class="question-text">' + escapeHtml(q.text) + '</div>';

            if (q.type === 'choice' && q.options) {
                html += '<div class="question-options">';
                q.options.forEach(function(opt) {
                    html += '<label class="question-option">' +
                        '<input type="checkbox" name="' + q.id + '" value="' + opt.key + '">' +
                        '<span>(' + opt.key + ') ' + escapeHtml(opt.text) + '</span>' +
                    '</label>';
                });
                html += '</div>';
            } else {
                html += '<textarea class="question-input" id="answer_' + q.id + '" placeholder="Type your answer..."></textarea>';
            }
            html += '</div>';
        });
        form.innerHTML = html;

        // Handle checkbox selection - toggle selected class based on checked state
        form.querySelectorAll('.question-option input[type="checkbox"]').forEach(function(checkbox) {
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    this.closest('.question-option').classList.add('selected');
                } else {
                    this.closest('.question-option').classList.remove('selected');
                }
            });
        });
        // Also handle clicks on the label for visual feedback
        form.querySelectorAll('.question-option').forEach(function(opt) {
            opt.addEventListener('click', function(e) {
                // Don't interfere if clicking directly on checkbox
                if (e.target.type === 'checkbox') return;
                var checkbox = this.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });

        modal.classList.add('visible');
    }

    function hideQuestionsModal() {
        document.getElementById('questionsModal').classList.remove('visible');
        pendingQuestions = null;
        // Clear context input
        var contextInput = document.getElementById('questionsContextInput');
        if (contextInput) contextInput.value = '';
        // Stop voice if active
        if (questionsVoiceActive) {
            stopQuestionsVoice();
        }
    }

    async function submitAnswers() {
        if (!pendingQuestions || !currentJobId) {
            hideQuestionsModal();
            return;
        }

        // Stop questions voice if active
        if (questionsVoiceActive) {
            stopQuestionsVoice();
        }

        var answers = {};
        pendingQuestions.forEach(function(q) {
            if (q.type === 'choice') {
                // Collect all checked checkboxes for this question
                var selectedOptions = document.querySelectorAll('input[name="' + q.id + '"]:checked');
                if (selectedOptions.length > 0) {
                    var values = [];
                    selectedOptions.forEach(function(opt) {
                        values.push(opt.value);
                    });
                    // Join multiple selections with comma
                    answers[q.id] = values.join(', ');
                }
            } else {
                var input = document.getElementById('answer_' + q.id);
                if (input && input.value.trim()) {
                    answers[q.id] = input.value.trim();
                }
            }
        });

        // Get additional context
        var contextInput = document.getElementById('questionsContextInput');
        var additionalContext = contextInput ? contextInput.value.trim() : '';

        // Allow submission with just context even if no specific answers
        if (Object.keys(answers).length === 0 && !additionalContext) {
            showToast('Please provide at least one answer or add context', 'error');
            return;
        }

        // Add context to answers if provided
        if (additionalContext) {
            answers['_additional_context'] = additionalContext;
        }

        hideQuestionsModal();
        showAckBanner('Sending answers to Claude...', false);

        try {
            var res = await fetch('/api/chat/answers', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    job_id: currentJobId,
                    answers: answers
                })
            });
            var data = await res.json();

            if (data.status === 'answers_submitted') {
                showAckBanner('Answers submitted - Claude is continuing...', true);
            } else {
                showToast('Failed to submit answers: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (err) {
            showToast('Error submitting answers: ' + err.message, 'error');
        }
    }
    window.submitAnswers = submitAnswers;
    window.showQuestionsModal = showQuestionsModal;
    window.hideQuestionsModal = hideQuestionsModal;

    function skipQuestions() {
        if (questionsVoiceActive) {
            stopQuestionsVoice();
        }
        hideQuestionsModal();
        showToast('Questions skipped - Claude will continue without answers', 'success');
    }
    window.skipQuestions = skipQuestions;

    // ========== QUESTIONS VOICE INPUT ==========
    function toggleQuestionsVoice() {
        if (questionsVoiceActive) {
            stopQuestionsVoice();
        } else {
            startQuestionsVoice();
        }
    }
    window.toggleQuestionsVoice = toggleQuestionsVoice;

    function startQuestionsVoice() {
        if (!SR) {
            showToast('Voice input not supported in this browser', 'error');
            return;
        }

        questionsRecognition = new SR();
        questionsRecognition.continuous = true;
        questionsRecognition.interimResults = true;
        questionsRecognition.lang = 'en-AU';

        var contextInput = document.getElementById('questionsContextInput');
        var voiceBtn = document.getElementById('questionsVoiceBtn');
        var indicator = document.getElementById('questionsVoiceIndicator');

        questionsRecognition.onresult = function(event) {
            var transcript = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            // Append to existing text
            var existing = contextInput.value;
            if (existing && !existing.endsWith(' ') && !existing.endsWith('\n')) {
                existing += ' ';
            }
            contextInput.value = existing + transcript;
        };

        questionsRecognition.onerror = function(event) {
            console.log('Questions voice error:', event.error);
            if (event.error !== 'no-speech') {
                showToast('Voice error: ' + event.error, 'error');
            }
            stopQuestionsVoice();
        };

        questionsRecognition.onend = function() {
            if (questionsVoiceActive) {
                // Restart if still active
                try {
                    questionsRecognition.start();
                } catch (e) {
                    stopQuestionsVoice();
                }
            }
        };

        try {
            questionsRecognition.start();
            questionsVoiceActive = true;
            voiceBtn.textContent = '⏹';
            voiceBtn.classList.add('recording');
            indicator.style.display = 'block';
            showToast('Listening... speak now', 'success');
        } catch (e) {
            showToast('Could not start voice input', 'error');
        }
    }

    function stopQuestionsVoice() {
        questionsVoiceActive = false;
        if (questionsRecognition) {
            try {
                questionsRecognition.stop();
            } catch (e) {}
            questionsRecognition = null;
        }
        var voiceBtn = document.getElementById('questionsVoiceBtn');
        var indicator = document.getElementById('questionsVoiceIndicator');
        if (voiceBtn) {
            voiceBtn.textContent = '🎤';
            voiceBtn.classList.remove('recording');
        }
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // ========== SCREENSHOTS ==========
    async function showScreenshotGallery() {
        try {
            var res = await fetch('/api/screenshots');
            var data = await res.json();
            if (!data.screenshots || data.screenshots.length === 0) {
                showToast('No screenshots found', 'error');
                return;
            }

            var cutoff = Date.now() - (30 * 60 * 1000);
            var recent = data.screenshots.filter(function(s) {
                return s.modified * 1000 > cutoff;
            });

            if (recent.length === 0) {
                recent = data.screenshots.slice(0, 20);
            }

            var html = '<div style="margin-top:20px;padding:16px;background:var(--bg-pane);border:1px solid var(--border);border-radius:8px;">' +
                '<h3 style="margin:0 0 12px 0;color:var(--accent);">Recent Screenshots (' + recent.length + ')</h3>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">';

            recent.forEach(function(s) {
                html += '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;cursor:pointer;" onclick="openLightbox(\'' + s.url + '\')">' +
                    '<img src="' + s.url + '" style="width:100%;height:120px;object-fit:cover;" alt="' + s.name + '">' +
                    '<div style="padding:6px;font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + s.name + '</div>' +
                '</div>';
            });

            html += '</div></div>';

            var container = document.createElement('div');
            container.innerHTML = html;
            responseArea.appendChild(container.firstChild);
            responsePane.scrollTop = responsePane.scrollHeight;
        } catch (e) {
            console.error('Failed to load screenshots:', e);
            showToast('Failed to load screenshots', 'error');
        }
    }
    window.showScreenshotGallery = showScreenshotGallery;

    // ========== FILE VIEWER ==========
    function openFileOrLink(path) {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Select a project first', 'error');
            return;
        }

        if (path.startsWith('http://') || path.startsWith('https://')) {
            window.open(path, '_blank');
            return;
        }

        fetch('/api/file/read', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ project: project, path: path })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.success && data.content) {
                var modal = document.createElement('div');
                modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
                modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

                var content = document.createElement('div');
                content.style.cssText = 'background:var(--bg-pane);border-radius:12px;max-width:900px;max-height:90vh;overflow:auto;padding:20px;position:relative;width:100%;';
                content.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px;">' +
                    '<h3 style="margin:0;color:var(--accent);">' + path + '</h3>' +
                    '<button onclick="this.closest(\'div\').parentElement.parentElement.remove()" style="background:none;border:none;color:var(--text);font-size:24px;cursor:pointer;">&times;</button>' +
                    '</div>' +
                    '<pre style="white-space:pre-wrap;word-wrap:break-word;margin:0;font-size:13px;line-height:1.5;">' +
                    data.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
                    '</pre>';

                modal.appendChild(content);
                document.body.appendChild(modal);
            } else {
                showToast('Could not open file: ' + (data.error || 'Unknown error'), 'error');
            }
        })
        .catch(function(e) {
            showToast('Error opening file: ' + e.message, 'error');
        });
    }
    window.openFileOrLink = openFileOrLink;

    // ========== PROJECT CHANGE ==========
    document.getElementById('projectSelect').addEventListener('change', async function() {
        var newProject = this.value;

        // If switching away from a project with an active job, keep it persisted
        // so we can return to it later
        if (currentJobId && currentJobProject) {
            console.log('Switching away from project with active job:', currentJobProject);
            // Job state is already persisted in localStorage, just stop local polling
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
            hideLiveBox();
            // Don't clear currentJobId/currentJobProject - they stay in localStorage
        }

        savedProject = newProject;
        localStorage.setItem('chatRelayProject', newProject);

        // Clear file browser state when switching projects
        // so the old project's file doesn't persist
        localStorage.removeItem('fileBrowserCurrentFile');
        localStorage.removeItem('fileBrowserProject');
        clearEditorMemoryState();
        // Clear explanation cache and Q&A history for old project
        if (typeof explainState !== 'undefined') {
            explainState.cachedFile = null;
            explainState.cachedExplanation = null;
            explainState.cachedContentHash = null;
        }
        if (typeof qaState !== 'undefined') {
            qaState.conversationHistory = [];
        }

        // Check if new project has an active job we should reconnect to
        if (newProject) {
            try {
                var res = await fetch('/api/active/' + encodeURIComponent(newProject));
                var data = await res.json();

                if (data.active && data.job) {
                    console.log('New project has active job:', data.job.id);

                    // Save job state for this project
                    saveJobState(data.job.id, newProject, data.job.message || '');
                    pendingUserMessage = data.job.message || '';

                    // Resume UI
                    startStreaming();
                    showLiveBox('Reconnecting...');
                    showAckBanner('Reconnecting to job ' + data.job.id + '...', true);

                    // Start polling
                    startPolling(data.job.id, newProject);
                } else {
                    // No active job for this project
                    currentJobId = null;
                    currentJobProject = null;
                    currentJobTitle = null;
                }
            } catch (err) {
                console.log('Error checking for active job:', err);
            }
        }

        loadChatHistory(newProject, true);
    });

    // ========== FILE BROWSER & EDITOR ==========
    var editorState = {
        currentFile: null,  // Don't load from localStorage here - restore when file browser opens
        originalContent: '',
        undoStack: [],
        redoStack: [],
        saveTimeout: null,
        isModified: false
    };
    var fileTreeCache = {};

    // Save editor state to localStorage
    function saveEditorState() {
        if (editorState.currentFile) {
            localStorage.setItem('fileBrowserCurrentFile', editorState.currentFile);
            localStorage.setItem('fileBrowserProject', document.getElementById('projectSelect').value);
        } else {
            localStorage.removeItem('fileBrowserCurrentFile');
            localStorage.removeItem('fileBrowserProject');
        }
    }

    // Track voice state before file browser opened (to restore on close)
    var fileBrowserVoiceState = {
        wasAutoReadOn: false,
        wasRecordingOn: false
    };

    function openFileBrowser() {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }
        document.getElementById('fileBrowserModal').style.display = 'block';
        document.getElementById('fileBrowserProject').textContent = project;
        loadFileTree('');

        // Apply font sizes now that the modal is visible in the DOM
        applyDisplaySettings();

        // Save current voice state and disable voice features while file browser is open
        fileBrowserVoiceState.wasAutoReadOn = autoReadEnabled;
        fileBrowserVoiceState.wasRecordingOn = isRecording;

        // Turn off auto-read if it was on
        if (autoReadEnabled) {
            autoReadEnabled = false;
            updateAutoReadButton();
            cancelAllSpeech();
            speakQueue = [];
        }

        // Turn off voice recording if it was on
        if (isRecording && recognition) {
            recognition.stop();
            isRecording = false;
            voiceBtn.classList.remove('recording');
            voiceBtn.textContent = '🎤';
            voiceDots.classList.remove('active');
        }

        // Restore last opened file if it was for this project
        var savedFile = localStorage.getItem('fileBrowserCurrentFile');
        var savedProject = localStorage.getItem('fileBrowserProject');
        if (savedFile && savedProject === project && !editorState.currentFile) {
            // Delay to let file tree load first
            setTimeout(function() {
                openFileInEditor(savedFile);
            }, 500);
        }
    }
    window.openFileBrowser = openFileBrowser;

    function closeFileBrowser() {
        if (editorState.isModified) {
            if (!confirm('You have unsaved changes. Close anyway?')) {
                return;
            }
        }
        document.getElementById('fileBrowserModal').style.display = 'none';
        // Only reset in-memory state, preserve localStorage for persistence
        clearEditorMemoryState();

        // Restore voice state that was active before file browser opened
        if (fileBrowserVoiceState.wasAutoReadOn) {
            autoReadEnabled = true;
            updateAutoReadButton();
        }

        if (fileBrowserVoiceState.wasRecordingOn && recognition) {
            isRecording = true;
            recognition.start();
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
            voiceDots.classList.add('active');
        }

        // Reset saved state
        fileBrowserVoiceState.wasAutoReadOn = false;
        fileBrowserVoiceState.wasRecordingOn = false;

        // Reset panel fullscreen states
        var body = document.querySelector('.file-browser-body');
        if (body) {
            body.classList.remove('editor-fullscreen', 'explain-fullscreen');
        }
        isEditorFullscreen = false;
        isExplainFullscreen = false;
    }
    window.closeFileBrowser = closeFileBrowser;

    function clearEditorMemoryState() {
        // Clear in-memory state only - preserve localStorage
        editorState.currentFile = null;
        editorState.originalContent = '';
        editorState.undoStack = [];
        editorState.redoStack = [];
        editorState.isModified = false;
        if (editorState.saveTimeout) clearTimeout(editorState.saveTimeout);

        var textarea = document.getElementById('editorTextarea');
        if (textarea) textarea.value = '';

        var filePath = document.getElementById('editorFilePath');
        if (filePath) filePath.textContent = 'No file open';

        updateEditorStatus('');
        updateEditorLineNumbers();
    }

    async function loadFileTree(dirPath) {
        var project = document.getElementById('projectSelect').value;
        var container = document.getElementById('fileTreeContainer');

        if (!dirPath) {
            container.innerHTML = '<div class="file-tree-loading">Loading...</div>';
        }

        try {
            var res = await fetch('/api/file/list', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project, path: dirPath })
            });
            var data = await res.json();

            if (data.success) {
                fileTreeCache[dirPath || '/'] = data.items;
                renderFileTree(data.items, dirPath);
            } else {
                container.innerHTML = '<div class="file-tree-loading">Error: ' + data.error + '</div>';
            }
        } catch (e) {
            container.innerHTML = '<div class="file-tree-loading">Error loading files</div>';
        }
    }
    window.loadFileTree = loadFileTree;

    function renderFileTree(items, parentPath) {
        var container = document.getElementById('fileTreeContainer');
        var html = '';

        items.forEach(function(item) {
            var icon = item.is_dir ? '📁' : getFileIcon(item.name);
            var clickHandler = item.is_dir ?
                'toggleFolder(event, \'' + escapeAttr(item.path) + '\')' :
                'openFileInEditor(\'' + escapeAttr(item.path) + '\')';

            html += '<div class="file-tree-item' + (item.is_dir ? ' folder' : ' file') + '" onclick="' + clickHandler + '" data-path="' + escapeAttr(item.path) + '">' +
                '<span class="icon">' + icon + '</span>' +
                '<span class="name">' + escapeHtml(item.name) + '</span>' +
                '</div>';

            if (item.is_dir) {
                html += '<div class="file-tree-children" id="tree-' + escapeAttr(item.path).replace(/\//g, '-') + '"></div>';
            }
        });

        if (parentPath) {
            var childContainer = document.getElementById('tree-' + parentPath.replace(/\//g, '-'));
            if (childContainer) {
                childContainer.innerHTML = html;
                childContainer.classList.add('expanded');
            }
        } else {
            container.innerHTML = html || '<div class="file-tree-loading">No files found</div>';
        }
    }

    function getFileIcon(filename) {
        var ext = filename.split('.').pop().toLowerCase();
        var icons = {
            'js': '📜', 'ts': '📜', 'jsx': '📜', 'tsx': '📜',
            'py': '🐍', 'rb': '💎', 'go': '🐹', 'rs': '🦀',
            'html': '🌐', 'css': '🎨', 'scss': '🎨', 'less': '🎨',
            'json': '📋', 'yaml': '📋', 'yml': '📋', 'toml': '📋',
            'md': '📝', 'txt': '📄', 'log': '📄',
            'sh': '⚡', 'bash': '⚡', 'zsh': '⚡',
            'sql': '🗃️', 'db': '🗃️',
            'png': '🖼️', 'jpg': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'pdf': '📕', 'doc': '📘', 'docx': '📘'
        };
        return icons[ext] || '📄';
    }

    function escapeAttr(str) {
        return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    async function toggleFolder(event, path) {
        event.stopPropagation();
        var item = event.currentTarget;
        var children = document.getElementById('tree-' + path.replace(/\//g, '-'));

        if (children.classList.contains('expanded')) {
            children.classList.remove('expanded');
            item.querySelector('.icon').textContent = '📁';
        } else {
            if (!children.innerHTML) {
                item.querySelector('.icon').textContent = '⏳';
                await loadFileTree(path);
            }
            children.classList.add('expanded');
            item.querySelector('.icon').textContent = '📂';
        }
    }
    window.toggleFolder = toggleFolder;

    async function openFileInEditor(filePath) {
        if (editorState.isModified) {
            if (!confirm('Discard unsaved changes to ' + editorState.currentFile + '?')) {
                return;
            }
        }

        var project = document.getElementById('projectSelect').value;
        var textarea = document.getElementById('editorTextarea');

        updateEditorStatus('Loading...', 'saving');

        try {
            var res = await fetch('/api/file/read', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project, path: filePath })
            });
            var data = await res.json();

            if (data.success) {
                textarea.value = data.content;
                editorState.currentFile = filePath;
                editorState.originalContent = data.content;
                editorState.undoStack = [];
                editorState.redoStack = [];
                editorState.isModified = false;

                document.getElementById('editorFilePath').textContent = filePath;
                updateEditorStatus('');
                updateEditorLineNumbers();
                updateEditorHighlight();

                // Persist file state
                saveEditorState();

                // Highlight selected file in tree
                document.querySelectorAll('.file-tree-item').forEach(function(el) {
                    el.classList.remove('selected');
                });
                var selectedEl = document.querySelector('.file-tree-item[data-path="' + filePath + '"]');
                if (selectedEl) selectedEl.classList.add('selected');

                // Auto-load explain for this file
                autoLoadExplain();

                // Load Q&A history for this file (persistent per file)
                loadQaHistoryForFile();
            } else {
                showToast('Failed to open file: ' + data.error, 'error');
                updateEditorStatus('Error', 'error');
            }
        } catch (e) {
            showToast('Error opening file: ' + e.message, 'error');
            updateEditorStatus('Error', 'error');
        }
    }
    window.openFileInEditor = openFileInEditor;

    // Reload the currently open file (after external modification)
    async function reloadCurrentFile() {
        if (!editorState.currentFile) return;

        var project = document.getElementById('projectSelect').value;
        var textarea = document.getElementById('editorTextarea');

        try {
            var res = await fetch('/api/file/read', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project, path: editorState.currentFile })
            });
            var data = await res.json();

            if (data.success) {
                // Only update if content actually changed
                if (data.content !== textarea.value) {
                    textarea.value = data.content;
                    editorState.originalContent = data.content;
                    editorState.isModified = false;
                    updateEditorLineNumbers();
                    updateEditorHighlight();
                    updateEditorStatus('Reloaded', 'saved');
                    setTimeout(function() { updateEditorStatus(''); }, 2000);
                }
            }
        } catch (e) {
            console.error('Failed to reload file:', e);
        }
    }
    window.reloadCurrentFile = reloadCurrentFile;

    function scheduleAutoSave() {
        if (editorState.saveTimeout) {
            clearTimeout(editorState.saveTimeout);
        }
        editorState.saveTimeout = setTimeout(function() {
            if (editorState.isModified && editorState.currentFile) {
                saveFile(true);
            }
        }, 2000);
    }

    function pushUndoState(content) {
        editorState.undoStack.push(content);
        editorState.redoStack = [];
        if (editorState.undoStack.length > 100) {
            editorState.undoStack.shift();
        }
    }

    function undoEdit() {
        if (editorState.undoStack.length === 0) {
            showToast('Nothing to undo', 'error');
            return;
        }
        var textarea = document.getElementById('editorTextarea');
        editorState.redoStack.push(textarea.value);
        textarea.value = editorState.undoStack.pop();
        onEditorChange(true);
        showToast('Undo', 'success');
    }
    window.undoEdit = undoEdit;

    function redoEdit() {
        if (editorState.redoStack.length === 0) {
            showToast('Nothing to redo', 'error');
            return;
        }
        var textarea = document.getElementById('editorTextarea');
        editorState.undoStack.push(textarea.value);
        textarea.value = editorState.redoStack.pop();
        onEditorChange(true);
        showToast('Redo', 'success');
    }
    window.redoEdit = redoEdit;

    async function saveFile(silent) {
        if (!editorState.currentFile) {
            if (!silent) showToast('No file open', 'error');
            return;
        }

        var project = document.getElementById('projectSelect').value;
        var textarea = document.getElementById('editorTextarea');

        updateEditorStatus('Saving...', 'saving');

        try {
            var res = await fetch('/api/file/write', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    project: project,
                    path: editorState.currentFile,
                    content: textarea.value
                })
            });
            var data = await res.json();

            if (data.success) {
                editorState.originalContent = textarea.value;
                editorState.isModified = false;
                updateEditorStatus('Saved', 'saved');
                if (!silent) showToast('File saved', 'success');

                setTimeout(function() {
                    if (!editorState.isModified) {
                        updateEditorStatus('');
                    }
                }, 2000);
            } else {
                updateEditorStatus('Save failed', 'error');
                showToast('Save failed: ' + data.error, 'error');
            }
        } catch (e) {
            updateEditorStatus('Save failed', 'error');
            showToast('Save error: ' + e.message, 'error');
        }
    }
    window.saveFile = saveFile;

    // Reload the current file from disk (for when external changes are made, e.g., by Q&A)
    async function reloadCurrentFile() {
        if (!editorState.currentFile) return;

        var project = document.getElementById('projectSelect').value;
        var textarea = document.getElementById('editorTextarea');

        try {
            var res = await fetch('/api/file/read', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project, path: editorState.currentFile })
            });
            var data = await res.json();

            if (data.success) {
                // Only update if content actually changed
                if (data.content !== textarea.value) {
                    textarea.value = data.content;
                    editorState.originalContent = data.content;
                    editorState.isModified = false;
                    updateEditorStatus('Reloaded', 'saved');
                    updateEditorLineNumbers();
                    updateEditorHighlight();

                    // Also refresh the explanation since file changed
                    if (explainState.isVisible) {
                        generateExplanation();
                    }
                }
            }
        } catch (e) {
            console.error('Failed to reload file:', e);
        }
    }
    window.reloadCurrentFile = reloadCurrentFile;

    function onEditorChange(skipUndoPush) {
        var textarea = document.getElementById('editorTextarea');

        var isModified = textarea.value !== editorState.originalContent;
        editorState.isModified = isModified;

        if (isModified) {
            updateEditorStatus('Modified', 'modified');
        }

        if (!skipUndoPush && editorState.currentFile) {
            pushUndoState(editorState.originalContent);
        }

        updateEditorLineNumbers();
        scheduleAutoSave();
    }

    function updateEditorLineNumbers() {
        var textarea = document.getElementById('editorTextarea');
        var lineNumbersEl = document.getElementById('editorLineNumbers');
        if (!textarea || !lineNumbersEl) return;

        var lines = (textarea.value || '').split('\n');
        var nums = [];
        for (var i = 1; i <= lines.length; i++) {
            nums.push(i);
        }
        lineNumbersEl.textContent = nums.join('\n');
    }

    // Syntax highlighting for the editor
    var currentEditorLanguage = null;

    function getLanguageFromFilename(filename) {
        if (!filename) return null;
        var ext = filename.split('.').pop().toLowerCase();
        var langMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'rb': 'ruby',
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'h': 'c',
            'hpp': 'cpp',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'php': 'php',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'less': 'less',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'markdown': 'markdown',
            'sql': 'sql',
            'sh': 'bash',
            'bash': 'bash',
            'zsh': 'bash',
            'dockerfile': 'dockerfile',
            'makefile': 'makefile',
            'swift': 'swift',
            'kt': 'kotlin',
            'scala': 'scala',
            'r': 'r',
            'lua': 'lua',
            'perl': 'perl',
            'pl': 'perl'
        };
        return langMap[ext] || null;
    }

    function updateEditorHighlight() {
        var textarea = document.getElementById('editorTextarea');
        var highlightEl = document.getElementById('editorHighlight');
        var codeEl = document.getElementById('editorHighlightCode');

        if (!textarea || !highlightEl || !codeEl) return;

        var content = textarea.value || '';
        var lang = getLanguageFromFilename(editorState.currentFile);

        if (!lang || typeof hljs === 'undefined') {
            // No highlighting - show text directly in textarea
            textarea.classList.add('no-highlight');
            codeEl.textContent = '';
            highlightEl.style.display = 'none';
            return;
        }

        textarea.classList.remove('no-highlight');
        highlightEl.style.display = 'block';
        currentEditorLanguage = lang;

        // Escape HTML and apply highlighting
        try {
            if (hljs.getLanguage(lang)) {
                codeEl.innerHTML = hljs.highlight(content, { language: lang }).value;
            } else {
                // Fallback to auto-detection
                codeEl.innerHTML = hljs.highlightAuto(content).value;
            }
        } catch (e) {
            // If highlighting fails, just escape and display
            codeEl.textContent = content;
        }

        // Add trailing newline to match textarea behavior
        if (content.endsWith('\n')) {
            codeEl.innerHTML += '\n';
        }
    }

    function syncEditorScroll() {
        var textarea = document.getElementById('editorTextarea');
        var highlightEl = document.getElementById('editorHighlight');
        var lineNumbersEl = document.getElementById('editorLineNumbers');

        if (textarea && highlightEl) {
            highlightEl.scrollTop = textarea.scrollTop;
            highlightEl.scrollLeft = textarea.scrollLeft;
        }
        if (textarea && lineNumbersEl) {
            lineNumbersEl.scrollTop = textarea.scrollTop;
        }
    }

    // Set up editor event listeners for syntax highlighting
    document.addEventListener('DOMContentLoaded', function() {
        var textarea = document.getElementById('editorTextarea');
        if (textarea) {
            textarea.addEventListener('input', function() {
                updateEditorHighlight();
                updateEditorLineNumbers();
            });
            textarea.addEventListener('scroll', syncEditorScroll);
        }
    });

    function updateEditorStatus(text, statusClass) {
        var statusEl = document.getElementById('editorStatus');
        if (statusEl) {
            statusEl.textContent = text;
            statusEl.className = 'editor-status' + (statusClass ? ' ' + statusClass : '');
        }
    }

    function readFileAloud() {
        if (!editorState.currentFile) {
            showToast('No file open', 'error');
            return;
        }

        var textarea = document.getElementById('editorTextarea');
        var content = textarea.value;

        if (isSpeakingText) {
            stopSpeaking();
        } else {
            var cleanedText = cleanTextForSpeech(content);
            speak(cleanedText, 'axion');
            showToast('Reading file... say "stop read" to stop', 'success');
        }
    }
    window.readFileAloud = readFileAloud;

    function filterFileTree(query) {
        var items = document.querySelectorAll('.file-tree-item');
        var q = query.toLowerCase();

        items.forEach(function(item) {
            var name = item.querySelector('.name').textContent.toLowerCase();
            if (!q || name.includes(q)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }
    window.filterFileTree = filterFileTree;

    function refreshFileTree() {
        fileTreeCache = {};
        loadFileTree('');
        showToast('Refreshed', 'success');
    }
    window.refreshFileTree = refreshFileTree;

    function resetEditorState() {
        editorState.currentFile = null;
        editorState.originalContent = '';
        editorState.undoStack = [];
        editorState.redoStack = [];
        editorState.isModified = false;
        if (editorState.saveTimeout) clearTimeout(editorState.saveTimeout);

        // Clear persisted state
        localStorage.removeItem('fileBrowserCurrentFile');
        localStorage.removeItem('fileBrowserProject');

        var textarea = document.getElementById('editorTextarea');
        if (textarea) textarea.value = '';

        var filePath = document.getElementById('editorFilePath');
        if (filePath) filePath.textContent = 'No file open';

        updateEditorStatus('');
        updateEditorLineNumbers();
    }

    // Editor keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        var modal = document.getElementById('fileBrowserModal');
        if (modal.style.display !== 'block') return;

        var textarea = document.getElementById('editorTextarea');
        if (document.activeElement !== textarea) return;

        // Ctrl+S: Save
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveFile();
            return;
        }
        // Ctrl+Z: Undo
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            undoEdit();
            return;
        }
        // Ctrl+Y or Ctrl+Shift+Z: Redo
        if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
            (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
            e.preventDefault();
            redoEdit();
            return;
        }
    });

    // Editor input listener
    (function() {
        var textarea = document.getElementById('editorTextarea');
        if (textarea) {
            textarea.addEventListener('input', function() {
                onEditorChange(false);
            });
            textarea.addEventListener('scroll', function() {
                var lineNumbers = document.getElementById('editorLineNumbers');
                if (lineNumbers) lineNumbers.scrollTop = this.scrollTop;
            });
        }
    })();

    // Close file browser with Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var modal = document.getElementById('fileBrowserModal');
            if (modal && modal.style.display === 'block') {
                closeFileBrowser();
            }
        }
    });

    // ========== FILE EXPLAIN FEATURE ==========
    var explainState = {
        isVisible: localStorage.getItem('explainPanelVisible') === 'true',
        isLoading: false,
        cachedExplanation: null,
        cachedFile: null,
        cachedContentHash: null
    };

    // Track explanation jobs running in parallel for different files
    // Key: "project:filepath", Value: { jobId, status, contentHash, pollInterval }
    var explainJobQueue = {};

    // Load explanation cache from localStorage
    var explanationCache = JSON.parse(localStorage.getItem('explanationCache') || '{}');

    // Check if a file has an explanation job running
    function getExplainJobStatus(project, filePath) {
        var key = project + ':' + filePath;
        return explainJobQueue[key] || null;
    }

    // Start tracking an explanation job
    function trackExplainJob(project, filePath, jobId, contentHash) {
        var key = project + ':' + filePath;
        explainJobQueue[key] = {
            jobId: jobId,
            status: 'loading',
            contentHash: contentHash,
            startTime: Date.now()
        };
    }

    // Update job status
    function updateExplainJobStatus(project, filePath, status) {
        var key = project + ':' + filePath;
        if (explainJobQueue[key]) {
            explainJobQueue[key].status = status;
        }
    }

    // Remove completed job from queue
    function removeExplainJob(project, filePath) {
        var key = project + ':' + filePath;
        delete explainJobQueue[key];
    }

    function hashContent(str) {
        // Simple hash function for content comparison
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(16);
    }

    function saveExplanationToCache(project, filePath, contentHash, explanation) {
        var key = project + ':' + filePath;
        explanationCache[key] = {
            contentHash: contentHash,
            explanation: explanation,
            timestamp: Date.now()
        };
        // Keep cache limited to last 100 files
        var keys = Object.keys(explanationCache);
        if (keys.length > 100) {
            var oldest = keys.sort(function(a, b) {
                return (explanationCache[a].timestamp || 0) - (explanationCache[b].timestamp || 0);
            })[0];
            delete explanationCache[oldest];
        }
        localStorage.setItem('explanationCache', JSON.stringify(explanationCache));
    }

    function getExplanationFromCache(project, filePath, contentHash) {
        var key = project + ':' + filePath;
        var cached = explanationCache[key];
        if (cached && cached.contentHash === contentHash) {
            return { explanation: cached.explanation, timestamp: cached.timestamp };
        }
        // Return outdated explanation info if hash doesn't match but we have one
        if (cached && cached.explanation) {
            return { explanation: cached.explanation, timestamp: cached.timestamp, outdated: true };
        }
        return null;
    }

    function formatTimestamp(ts) {
        if (!ts) return '';
        var d = new Date(ts);
        var now = new Date();
        var diff = now - d;

        // Less than a minute ago
        if (diff < 60000) return 'just now';
        // Less than an hour ago
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        // Less than a day ago
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        // Otherwise show date
        return d.toLocaleDateString();
    }

    function toggleExplainPanel() {
        var panel = document.getElementById('explainPanel');

        if (explainState.isVisible) {
            // Hide panel
            panel.style.display = 'none';
            explainState.isVisible = false;
            localStorage.setItem('explainPanelVisible', 'false');
            document.getElementById('explainBtn').classList.remove('active');
            // Exit explain fullscreen if active
            var body = document.querySelector('.file-browser-body');
            if (body) body.classList.remove('explain-fullscreen');
        } else {
            // Show panel
            showExplainPanel();
        }
    }
    window.toggleExplainPanel = toggleExplainPanel;

    // File browser panel fullscreen toggles
    var isEditorFullscreen = false;
    var isExplainFullscreen = false;

    function toggleEditorFullscreen(event) {
        // Don't trigger on double-click of buttons/inputs inside the header
        if (event && (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT')) return;
        var body = document.querySelector('.file-browser-body');
        if (!body) return;

        // If explain is fullscreen, exit that first
        if (isExplainFullscreen) {
            body.classList.remove('explain-fullscreen');
            isExplainFullscreen = false;
            var explainBtn = document.getElementById('explainFullscreenBtn');
            if (explainBtn) explainBtn.textContent = '⛶';
        }

        isEditorFullscreen = !isEditorFullscreen;
        var btn = document.getElementById('editorFullscreenBtn');

        if (isEditorFullscreen) {
            body.classList.add('editor-fullscreen');
            if (btn) btn.textContent = '⛶';
            if (btn) btn.title = 'Exit fullscreen';
        } else {
            body.classList.remove('editor-fullscreen');
            if (btn) btn.textContent = '⛶';
            if (btn) btn.title = 'Fullscreen';
        }
    }
    window.toggleEditorFullscreen = toggleEditorFullscreen;

    function toggleExplainFullscreen(event) {
        // Don't trigger on double-click of buttons/inputs inside the header
        if (event && (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT')) return;
        var body = document.querySelector('.file-browser-body');
        if (!body) return;

        // If editor is fullscreen, exit that first
        if (isEditorFullscreen) {
            body.classList.remove('editor-fullscreen');
            isEditorFullscreen = false;
            var editorBtn = document.getElementById('editorFullscreenBtn');
            if (editorBtn) editorBtn.textContent = '⛶';
        }

        isExplainFullscreen = !isExplainFullscreen;
        var btn = document.getElementById('explainFullscreenBtn');

        if (isExplainFullscreen) {
            body.classList.add('explain-fullscreen');
            if (btn) btn.textContent = '⛶';
            if (btn) btn.title = 'Exit fullscreen';
        } else {
            body.classList.remove('explain-fullscreen');
            if (btn) btn.textContent = '⛶';
            if (btn) btn.title = 'Fullscreen';
        }
    }
    window.toggleExplainFullscreen = toggleExplainFullscreen;

    function showExplainPanel() {
        var panel = document.getElementById('explainPanel');
        panel.style.display = 'flex';
        explainState.isVisible = true;
        localStorage.setItem('explainPanelVisible', 'true');
        document.getElementById('explainBtn').classList.add('active');

        // Check if we need to load/generate explanation
        if (editorState.currentFile) {
            loadOrGenerateExplanation();
        }
    }

    // Auto-load explain when a file is opened
    function autoLoadExplain() {
        if (!editorState.currentFile) return;

        var content = document.getElementById('editorTextarea').value;
        var project = document.getElementById('projectSelect').value;
        var contentHash = hashContent(content);
        var contentDiv = document.getElementById('explainContent');

        // Check if we have a cached explanation for this file
        var cached = getExplanationFromCache(project, editorState.currentFile, contentHash);

        // Check if there's already a job running for this file
        var runningJob = getExplainJobStatus(project, editorState.currentFile);

        // Always show the explain panel for the new file
        var panel = document.getElementById('explainPanel');
        panel.style.display = 'flex';
        explainState.isVisible = true;
        localStorage.setItem('explainPanelVisible', 'true');
        document.getElementById('explainBtn').classList.add('active');

        // Also open Q&A panel by default
        var qaPanel = document.getElementById('qaPanel');
        if (qaPanel) {
            qaPanel.style.display = 'flex';
            qaState.isActive = true;
        }

        if (cached && !cached.outdated) {
            // Load from cache - explanation already exists
            explainState.cachedExplanation = cached.explanation;
            explainState.cachedFile = editorState.currentFile;
            explainState.cachedContentHash = contentHash;
            contentDiv.innerHTML = renderMarkdown(cached.explanation);
            updateExplainStatus('cached');
            document.getElementById('explainTimestamp').textContent = formatTimestamp(cached.timestamp);
        } else if (runningJob && runningJob.status === 'loading') {
            // Job already running for this file - show loading state
            contentDiv.innerHTML = '<div class="explain-loading">Analyzing file... (started ' + formatTimestamp(runningJob.startTime) + ')</div>';
            updateExplainStatus('loading');
            document.getElementById('explainTimestamp').textContent = '';
        } else if (cached && cached.outdated) {
            // File changed - auto-regenerate
            generateExplanationForFile(project, editorState.currentFile, content, contentHash);
        } else {
            // No cache and no running job - generate new explanation
            generateExplanationForFile(project, editorState.currentFile, content, contentHash);
        }
    }
    window.autoLoadExplain = autoLoadExplain;

    function loadOrGenerateExplanation() {
        var content = document.getElementById('editorTextarea').value;
        var contentDiv = document.getElementById('explainContent');
        var timestampSpan = document.getElementById('explainTimestamp');
        var project = document.getElementById('projectSelect').value;

        if (!content || !editorState.currentFile) {
            contentDiv.innerHTML = '<div class="explain-placeholder">Open a file to get an explanation</div>';
            if (timestampSpan) timestampSpan.textContent = '';
            return;
        }

        var contentHash = hashContent(content);

        // Check if we have a cached explanation
        var cached = getExplanationFromCache(project, editorState.currentFile, contentHash);

        if (cached && !cached.outdated) {
            // Use valid cached explanation
            explainState.cachedExplanation = cached.explanation;
            explainState.cachedFile = editorState.currentFile;
            explainState.cachedContentHash = contentHash;
            contentDiv.innerHTML = renderMarkdown(cached.explanation);
            updateExplainStatus('cached');
            if (timestampSpan) timestampSpan.textContent = formatTimestamp(cached.timestamp);
        } else if (cached && cached.outdated) {
            // File has changed since last explanation - show option to view old or regenerate
            explainState.cachedExplanation = cached.explanation; // Keep for reading aloud
            contentDiv.innerHTML = '<div class="explain-placeholder" style="text-align:left;">' +
                '<div style="color:var(--warning);margin-bottom:12px;">⚠️ File has changed since last explanation (' + formatTimestamp(cached.timestamp) + ')</div>' +
                '<div style="display:flex;gap:8px;margin-top:12px;">' +
                '<button class="btn" onclick="showOutdatedExplanation()" style="background:var(--bg-input);">View Previous</button>' +
                '<button class="btn primary" onclick="generateExplanation()">Generate New</button>' +
                '</div></div>';
            updateExplainStatus('outdated');
            if (timestampSpan) timestampSpan.textContent = '';
        } else if (explainState.cachedFile !== editorState.currentFile) {
            // New file with no cached explanation, generate one
            if (timestampSpan) timestampSpan.textContent = '';
            generateExplanation();
        }
    }

    function showOutdatedExplanation() {
        var contentDiv = document.getElementById('explainContent');
        if (explainState.cachedExplanation) {
            contentDiv.innerHTML = renderMarkdown(explainState.cachedExplanation);
            updateExplainStatus('outdated');
            showToast('Showing previous explanation', 'success');
        }
    }
    window.showOutdatedExplanation = showOutdatedExplanation;

    function updateExplainStatus(status) {
        var statusIndicator = document.getElementById('explainStatus');
        if (!statusIndicator) return;

        switch(status) {
            case 'cached':
                statusIndicator.textContent = '✓ Cached';
                statusIndicator.style.color = 'var(--success)';
                break;
            case 'outdated':
                statusIndicator.textContent = '⚠ Outdated';
                statusIndicator.style.color = 'var(--warning)';
                break;
            case 'loading':
                statusIndicator.textContent = '⏳ Loading...';
                statusIndicator.style.color = 'var(--text-secondary)';
                break;
            default:
                statusIndicator.textContent = '';
        }
    }

    // Generate explanation for a specific file (supports parallel jobs)
    async function generateExplanationForFile(project, filePath, content, contentHash) {
        var contentDiv = document.getElementById('explainContent');

        if (!content || !filePath) {
            if (filePath === editorState.currentFile) {
                contentDiv.innerHTML = '<div class="explain-placeholder">Open a file to get an explanation</div>';
            }
            return;
        }

        // Check if already running for this file
        var existingJob = getExplainJobStatus(project, filePath);
        if (existingJob && existingJob.status === 'loading') {
            return; // Already running
        }

        // Update UI only if this is the current file
        if (filePath === editorState.currentFile) {
            updateExplainStatus('loading');
            contentDiv.innerHTML = '<div class="explain-loading">Analyzing file...</div>';
        }

        try {
            // Start the explanation job
            var res = await fetch('/api/file/explain', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    project: project,
                    path: filePath,
                    content: content
                })
            });
            var data = await res.json();

            if (!data.success || !data.job_id) {
                if (filePath === editorState.currentFile) {
                    contentDiv.innerHTML = '<div class="explain-placeholder">Error: ' + escapeHtml(data.error || 'Failed to start explanation') + '</div>';
                    updateExplainStatus('');
                }
                return;
            }

            // Track this job
            trackExplainJob(project, filePath, data.job_id, contentHash);

            // Poll for the result (continues even if user switches files)
            var jobId = data.job_id;
            var pollCount = 0;
            var maxPolls = 120; // 2 minutes max

            var pollForExplanation = async function() {
                pollCount++;

                if (pollCount > maxPolls) {
                    removeExplainJob(project, filePath);
                    if (filePath === editorState.currentFile) {
                        contentDiv.innerHTML = '<div class="explain-placeholder">Explanation timed out. Please try again.</div>';
                        updateExplainStatus('');
                    }
                    return;
                }

                try {
                    var statusRes = await fetch('/api/chat/status', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ job_id: jobId })
                    });
                    var statusData = await statusRes.json();

                    if (statusData.status === 'complete') {
                        // Got the explanation - save to cache regardless of current file
                        var explanation = statusData.result || 'No explanation generated';

                        // Save to persistent cache
                        saveExplanationToCache(project, filePath, contentHash, explanation);

                        // Remove from job queue
                        removeExplainJob(project, filePath);

                        // Update UI only if still viewing this file
                        if (filePath === editorState.currentFile) {
                            explainState.cachedExplanation = explanation;
                            explainState.cachedFile = filePath;
                            explainState.cachedContentHash = contentHash;
                            contentDiv.innerHTML = renderMarkdown(explanation);
                            updateExplainStatus('cached');
                            document.getElementById('explainTimestamp').textContent = formatTimestamp(Date.now());
                        }
                    } else if (statusData.status === 'error') {
                        removeExplainJob(project, filePath);
                        if (filePath === editorState.currentFile) {
                            contentDiv.innerHTML = '<div class="explain-placeholder">Error: ' + escapeHtml(statusData.error || 'Unknown error') + '</div>';
                            updateExplainStatus('');
                        }
                    } else {
                        // Still processing - update UI if viewing this file
                        if (filePath === editorState.currentFile) {
                            var dots = '.'.repeat((pollCount % 3) + 1);
                            contentDiv.innerHTML = '<div class="explain-loading">Analyzing file' + dots + '</div>';
                        }
                        setTimeout(pollForExplanation, 1000);
                    }
                } catch (e) {
                    removeExplainJob(project, filePath);
                    if (filePath === editorState.currentFile) {
                        contentDiv.innerHTML = '<div class="explain-placeholder">Error checking status: ' + e.message + '</div>';
                        updateExplainStatus('');
                    }
                }
            };

            // Start polling after a brief delay
            setTimeout(pollForExplanation, 1000);

        } catch (e) {
            removeExplainJob(project, filePath);
            if (filePath === editorState.currentFile) {
                contentDiv.innerHTML = '<div class="explain-placeholder">Failed to generate explanation: ' + e.message + '</div>';
                updateExplainStatus('');
            }
        }
    }

    // Wrapper for current file (for button clicks)
    async function generateExplanation() {
        var content = document.getElementById('editorTextarea').value;
        var project = document.getElementById('projectSelect').value;
        var contentHash = hashContent(content);
        await generateExplanationForFile(project, editorState.currentFile, content, contentHash);
    }
    window.generateExplanation = generateExplanation;

    function refreshExplanation() {
        // Clear both memory and localStorage cache for this file
        var project = document.getElementById('projectSelect').value;
        if (editorState.currentFile) {
            var key = project + ':' + editorState.currentFile;
            delete explanationCache[key];
            localStorage.setItem('explanationCache', JSON.stringify(explanationCache));
        }
        explainState.cachedFile = null;
        explainState.cachedExplanation = null;
        explainState.cachedContentHash = null;
        generateExplanation();
    }
    window.refreshExplanation = refreshExplanation;

    var isReadingExplanation = false;
    var explanationSpeechQueue = [];

    function readExplanationAloud() {
        var readBtn = document.querySelector('#explainPanel .explain-controls .icon-btn[title="Read explanation aloud"]');

        // If already reading, stop it
        if (isReadingExplanation) {
            cancelAllSpeech();
            explanationSpeechQueue = [];
            isReadingExplanation = false;
            if (readBtn) {
                readBtn.textContent = '🔊';
                readBtn.classList.remove('active');
            }
            showToast('Stopped reading', 'success');
            return;
        }

        if (!explainState.cachedExplanation) {
            showToast('No explanation to read', 'error');
            return;
        }

        // Clean the explanation for speech (strip markdown)
        var cleanText = cleanTextForSpeech(explainState.cachedExplanation);

        if (!cleanText || cleanText.length < 10) {
            showToast('No text to read', 'error');
            return;
        }

        // Cancel any ongoing speech first
        cancelAllSpeech();
        isSpeakingText = false;
        speakQueue = [];
        isSpeaking = false;

        // Show that we're reading
        isReadingExplanation = true;
        if (readBtn) {
            readBtn.textContent = '⏹';
            readBtn.classList.add('active');
        }
        showToast('Reading explanation...', 'success');

        // Chrome has a bug where speech stops after ~15 seconds
        // Split text into chunks at sentence boundaries
        var chunks = splitTextIntoChunks(cleanText, 200); // ~200 chars per chunk
        explanationSpeechQueue = chunks.slice(); // Copy array

        speakNextExplanationChunk(readBtn);
    }
    window.readExplanationAloud = readExplanationAloud;

    // splitTextIntoChunks is defined earlier (near speakWithEdgeTts) — single definition used by both Edge TTS and explanation reading

    function speakNextExplanationChunk(readBtn) {
        if (!isReadingExplanation || explanationSpeechQueue.length === 0) {
            // Done reading
            isReadingExplanation = false;
            explanationSpeechQueue = [];
            if (readBtn) {
                readBtn.textContent = '🔊';
                readBtn.classList.remove('active');
            }
            return;
        }

        var chunk = explanationSpeechQueue.shift();
        // Skip empty or very short chunks
        if (!chunk || chunk.trim().length < 3) {
            speakNextExplanationChunk(readBtn);
            return;
        }

        // Route to Edge TTS if selected
        if (voiceSettings.engine === 'edge-tts') {
            var edgeVoice = voiceSettings.axionEdgeVoice || 'en-US-GuyNeural';
            speakWithEdgeTts(chunk, edgeVoice, function() {
                if (isReadingExplanation) {
                    setTimeout(function() { speakNextExplanationChunk(readBtn); }, 100);
                }
            });
            return;
        }

        // Route to ElevenLabs if selected
        if (voiceSettings.engine === 'elevenlabs' && voiceSettings.axionElevenVoice) {
            speakWithElevenLabs(chunk, voiceSettings.axionElevenVoice,
                voiceSettings.elevenStability || 0.5, voiceSettings.elevenSimilarity || 0.75,
                function() {
                    if (isReadingExplanation) {
                        setTimeout(function() { speakNextExplanationChunk(readBtn); }, 100);
                    }
                });
            return;
        }

        // Browser speech engine
        var u = new SpeechSynthesisUtterance(chunk);

        // Apply voice settings
        var voices = window.speechSynthesis.getVoices();
        var selectedVoice = voiceSettings.axion;
        if (selectedVoice && voices.length > 0) {
            for (var i = 0; i < voices.length; i++) {
                if (voices[i].name === selectedVoice) {
                    u.voice = voices[i];
                    break;
                }
            }
        }

        u.rate = voiceSettings.axionRate || 1.0;
        u.pitch = voiceSettings.axionPitch || 1.0;

        u.onend = function() {
            // Small delay between chunks to avoid Chrome speech synthesis bugs
            setTimeout(function() {
                speakNextExplanationChunk(readBtn);
            }, 100);
        };

        u.onerror = function(e) {
            var errorType = e.error || (e.target && e.target.error) || 'unknown';
            console.warn('Speech chunk error (' + errorType + '):', chunk.substring(0, 50));
            // If canceled/interrupted, stop reading entirely
            if (errorType === 'canceled' || errorType === 'interrupted') {
                isReadingExplanation = false;
                explanationSpeechQueue = [];
                if (readBtn) {
                    readBtn.textContent = '🔊';
                    readBtn.classList.remove('active');
                }
                return;
            }
            // For other errors, try next chunk after a delay
            setTimeout(function() {
                speakNextExplanationChunk(readBtn);
            }, 200);
        };

        // Chrome workaround: cancel then speak with tiny delay to avoid queuing issues
        window.speechSynthesis.cancel();
        setTimeout(function() {
            if (isReadingExplanation) {
                window.speechSynthesis.speak(u);
            }
        }, 50);
    }

    // ========== Q&A PANEL ==========
    var qaAutoReadEnabled = localStorage.getItem('qaAutoRead') !== 'false'; // Default ON

    function toggleQaAutoRead() {
        qaAutoReadEnabled = !qaAutoReadEnabled;
        localStorage.setItem('qaAutoRead', qaAutoReadEnabled ? 'true' : 'false');
        var btn = document.getElementById('qaAutoReadBtn');
        if (btn) {
            if (qaAutoReadEnabled) {
                btn.classList.add('active');
                btn.style.background = 'var(--success)';
                btn.style.borderColor = 'var(--success)';
                btn.title = 'AI voice response: ON';
                showToast('Q&A voice responses enabled', 'success');
            } else {
                btn.classList.remove('active');
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.title = 'AI voice response: OFF';
                cancelAllSpeech();
                showToast('Q&A voice responses disabled', 'success');
            }
        }
    }
    window.toggleQaAutoRead = toggleQaAutoRead;

    function speakQaResponse(text) {
        if (!qaAutoReadEnabled || !text) return;

        // Clean for speech
        var speechText = cleanTextForSpeech(text);
        if (!speechText || speechText.length < 3) return;

        // Truncate very long responses
        if (speechText.length > 1500) {
            speechText = speechText.substring(0, 1500) + '... Response truncated.';
        }

        speak(speechText, 'axion');
    }

    // Initialize Q&A auto-read button state on load
    setTimeout(function() {
        var btn = document.getElementById('qaAutoReadBtn');
        if (btn && !qaAutoReadEnabled) {
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.title = 'AI voice response: OFF';
        }
    }, 100);

    var qaState = {
        isActive: false,
        conversationHistory: [],
        isLoading: false,
        isVoiceActive: false
    };

    // Persistent Q&A storage key per file
    function getQaStorageKey(filePath) {
        return 'qaHistory_' + (filePath || '').replace(/[^a-zA-Z0-9]/g, '_');
    }

    // Load Q&A history for current file
    function loadQaHistoryForFile() {
        if (!editorState.currentFile) {
            qaState.conversationHistory = [];
            return;
        }
        var key = getQaStorageKey(editorState.currentFile);
        try {
            var stored = localStorage.getItem(key);
            qaState.conversationHistory = stored ? JSON.parse(stored) : [];
        } catch (e) {
            qaState.conversationHistory = [];
        }
        renderQaHistory();
    }

    // Save Q&A history for current file
    function saveQaHistoryForFile() {
        if (!editorState.currentFile) return;
        var key = getQaStorageKey(editorState.currentFile);
        try {
            localStorage.setItem(key, JSON.stringify(qaState.conversationHistory));
        } catch (e) {
            console.log('Failed to save Q&A history:', e);
        }
    }

    function toggleQaPanel() {
        var panel = document.getElementById('qaPanel');
        if (!panel) return;

        if (qaState.isActive) {
            panel.style.display = 'none';
            qaState.isActive = false;
        } else {
            panel.style.display = 'flex';
            qaState.isActive = true;
            document.getElementById('qaInput').focus();
        }
    }
    window.toggleQaPanel = toggleQaPanel;

    function handleQaKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitQaQuestion();
        }
    }
    window.handleQaKeydown = handleQaKeydown;

    function tryClientSideAnswer(question, content, filePath) {
        var q = question.toLowerCase().trim();
        var ext = filePath ? filePath.split('.').pop().toLowerCase() : '';
        var lineCount = (content.match(/\n/g) || []).length + 1;

        var langMap = {
            'js': 'JavaScript', 'ts': 'TypeScript', 'py': 'Python', 'rb': 'Ruby',
            'java': 'Java', 'go': 'Go', 'rs': 'Rust', 'cpp': 'C++', 'c': 'C',
            'cs': 'C#', 'php': 'PHP', 'swift': 'Swift', 'kt': 'Kotlin',
            'html': 'HTML', 'css': 'CSS', 'json': 'JSON', 'md': 'Markdown',
            'yaml': 'YAML', 'yml': 'YAML', 'xml': 'XML', 'sql': 'SQL',
            'sh': 'Shell/Bash', 'bash': 'Shell/Bash', 'txt': 'Plain text'
        };

        // "what language" / "what type of file"
        if (q.match(/what (language|type|kind|format)/)) {
            var lang = langMap[ext] || ext.toUpperCase();
            return 'This is a **' + lang + '** file (`.' + ext + '`), with **' + lineCount + ' lines**.';
        }
        // "how many lines" / "how long"
        if (q.match(/how many lines|how long is|line count|how big/)) {
            var charCount = content.length;
            var wordCount = content.split(/\s+/).length;
            return 'This file has **' + lineCount + ' lines**, approximately **' + wordCount + ' words**, and **' + charCount.toLocaleString() + ' characters**.';
        }
        // "what is the file name" / "file path"
        if (q.match(/file ?name|file ?path|what file/)) {
            return 'The file is **' + filePath + '** (.' + ext + ').';
        }

        return null; // No client-side answer, proceed to API
    }

    async function submitQaQuestion(questionText) {
        var input = document.getElementById('qaInput');
        var question = questionText || (input ? input.value.trim() : '');

        if (!question) return;
        if (qaState.isLoading) return;
        if (!editorState.currentFile) {
            showToast('Open a file first', 'error');
            return;
        }

        // Clear input
        if (input) input.value = '';

        // Try answering client-side first (free, instant)
        var content = document.getElementById('editorTextarea').value;
        var localAnswer = tryClientSideAnswer(question, content, editorState.currentFile);
        if (localAnswer) {
            qaState.conversationHistory.push({role: 'user', content: question});
            qaState.conversationHistory.push({role: 'assistant', content: localAnswer});
            renderQaHistory();
            speakQaResponse(localAnswer);
            return;
        }

        // Add user message to history
        qaState.conversationHistory.push({role: 'user', content: question});
        renderQaHistory();

        // Start loading
        qaState.isLoading = true;
        addQaLoadingMessage();

        var content = document.getElementById('editorTextarea').value;
        var project = document.getElementById('projectSelect').value;

        try {
            var res = await fetch('/api/file/qa', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    project: project,
                    path: editorState.currentFile,
                    content: content,
                    question: question,
                    history: qaState.conversationHistory.slice(-10)
                })
            });
            var data = await res.json();

            if (!data.success || !data.job_id) {
                removeQaLoadingMessage();
                qaState.conversationHistory.push({role: 'assistant', content: 'Error: ' + (data.error || 'Failed to start')});
                renderQaHistory();
                qaState.isLoading = false;
                return;
            }

            // Poll for result - pass modify flag so we know to reload file
            pollQaResult(data.job_id, data.is_modify);

        } catch (e) {
            removeQaLoadingMessage();
            qaState.conversationHistory.push({role: 'assistant', content: 'Error: ' + e.message});
            renderQaHistory();
            qaState.isLoading = false;
        }
    }
    window.submitQaQuestion = submitQaQuestion;

    async function pollQaResult(jobId, isModify) {
        var pollCount = 0;
        var maxPolls = 120;

        var poll = async function() {
            pollCount++;
            if (pollCount > maxPolls) {
                removeQaLoadingMessage();
                qaState.conversationHistory.push({role: 'assistant', content: 'Request timed out. Please try again.'});
                renderQaHistory();
                qaState.isLoading = false;
                return;
            }

            try {
                var res = await fetch('/api/chat/status', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({job_id: jobId})
                });
                var data = await res.json();

                if (data.status === 'complete') {
                    removeQaLoadingMessage();
                    var answer = data.result || 'No answer generated';
                    qaState.conversationHistory.push({role: 'assistant', content: answer});
                    renderQaHistory();
                    qaState.isLoading = false;

                    // Speak the response if Q&A auto-read is enabled
                    speakQaResponse(answer);

                    // Reload file if this was a modify request or response suggests changes were made
                    var lowerAnswer = answer.toLowerCase();
                    var responseIndicatesChange = lowerAnswer.includes('updated') || lowerAnswer.includes('modified') ||
                        lowerAnswer.includes('changed') || lowerAnswer.includes('edited') ||
                        lowerAnswer.includes('added') || lowerAnswer.includes('removed') ||
                        lowerAnswer.includes('fixed') || lowerAnswer.includes('refactored') ||
                        lowerAnswer.includes('replaced') || lowerAnswer.includes('inserted');
                    if (isModify || responseIndicatesChange) {
                        if (editorState.currentFile) {
                            setTimeout(function() {
                                reloadCurrentFile();
                                showToast('File updated - editor refreshed', 'success');
                            }, 500);
                        }
                    }
                } else if (data.status === 'error') {
                    removeQaLoadingMessage();
                    qaState.conversationHistory.push({role: 'assistant', content: 'Error: ' + (data.error || 'Unknown error')});
                    renderQaHistory();
                    qaState.isLoading = false;
                } else {
                    setTimeout(poll, 1000);
                }
            } catch (e) {
                removeQaLoadingMessage();
                qaState.conversationHistory.push({role: 'assistant', content: 'Error: ' + e.message});
                renderQaHistory();
                qaState.isLoading = false;
            }
        };

        setTimeout(poll, 1000);
    }

    function renderQaHistory() {
        var historyDiv = document.getElementById('qaHistory');
        if (!historyDiv) return;

        var html = '';
        qaState.conversationHistory.forEach(function(msg, idx) {
            var className = msg.role === 'user' ? 'user' : 'assistant';
            var content = msg.role === 'assistant' ? renderMarkdown(msg.content) : escapeHtml(msg.content);
            if (msg.role === 'assistant') {
                html += '<div class="qa-message ' + className + '">' + content +
                    '<button class="qa-replay-btn" onclick="replayQaMessage(' + idx + ')" title="Read aloud">🔊</button></div>';
            } else {
                html += '<div class="qa-message ' + className + '">' + content + '</div>';
            }
        });

        if (html === '') {
            html = '<div class="qa-message assistant">Ask any question about this file. I\'ll help you understand it better!</div>';
        }

        historyDiv.innerHTML = html;
        historyDiv.scrollTop = historyDiv.scrollHeight;

        // Save to localStorage for persistence
        saveQaHistoryForFile();
    }

    function replayQaMessage(idx) {
        var msg = qaState.conversationHistory[idx];
        if (!msg || msg.role !== 'assistant') return;
        // Cancel any current speech first
        cancelAllSpeech();
        isSpeakingText = false;
        // Speak the message
        var text = msg.content;
        if (text.length > 1500) text = text.substring(0, 1500) + '... Response truncated.';
        speak(text, 'axion');
    }
    window.replayQaMessage = replayQaMessage;

    function addQaLoadingMessage() {
        var historyDiv = document.getElementById('qaHistory');
        if (!historyDiv) return;
        historyDiv.innerHTML += '<div class="qa-loading" id="qaLoadingMsg">Thinking...</div>';
        historyDiv.scrollTop = historyDiv.scrollHeight;
    }

    function removeQaLoadingMessage() {
        var loadingMsg = document.getElementById('qaLoadingMsg');
        if (loadingMsg) loadingMsg.remove();
    }

    function clearQaHistory() {
        qaState.conversationHistory = [];
        // Also clear from localStorage
        if (editorState.currentFile) {
            var key = getQaStorageKey(editorState.currentFile);
            localStorage.removeItem(key);
        }
        renderQaHistory();
        showToast('Q&A history cleared', 'success');
    }
    window.clearQaHistory = clearQaHistory;

    var qaRecognition = null;
    var wasMainRecordingBeforeQa = false;

    function toggleQaVoice() {
        var btn = document.getElementById('qaVoiceBtn');

        if (qaState.isVoiceActive) {
            // Stop voice recognition
            if (qaRecognition) {
                qaRecognition.stop();
            }
            qaState.isVoiceActive = false;
            if (btn) {
                btn.classList.remove('active');
                btn.textContent = '🎤';
            }
            // Restore main voice if it was active before
            if (wasMainRecordingBeforeQa && recognition) {
                wasMainRecordingBeforeQa = false;
                setTimeout(function() {
                    isRecording = true;
                    recognition.start();
                    voiceBtn.classList.add('recording');
                    voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                    voiceDots.classList.add('active');
                }, 100);
            }
            showToast('Voice input stopped', 'success');
        } else {
            // Start voice recognition for Q&A
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                showToast('Voice recognition not supported', 'error');
                return;
            }

            // Cancel any ongoing speech synthesis first - it can block the microphone
            if (isSpeakingText || window.speechSynthesis.speaking || edgeTtsAudio) {
                cancelAllSpeech();
                isSpeakingText = false;
                wasRecordingBeforeSpeak = false; // Prevent speak onend from restoring main recognition
            }

            // IMPORTANT: Stop main recognition first - only one can run at a time
            if (isRecording && recognition) {
                wasMainRecordingBeforeQa = true;
                recognition.stop();
                isRecording = false;
                voiceBtn.classList.remove('recording');
                voiceBtn.textContent = '🎤';
                voiceDots.classList.remove('active');
            }

            // Small delay to let main recognition and speech synthesis fully stop
            setTimeout(function() {
                // Stop any existing qaRecognition instance first
                if (qaRecognition) {
                    try { qaRecognition.stop(); } catch(e) {}
                    qaRecognition = null;
                }
                var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                qaRecognition = new SpeechRecognition();
                qaRecognition.continuous = true;
                qaRecognition.interimResults = true;
                qaRecognition.lang = 'en-AU';

                var qaVoiceTimeout = null;
                var qaFinalTranscript = '';

                qaRecognition.onstart = function() {
                    qaState.isVoiceActive = true;
                    qaFinalTranscript = '';
                    if (btn) {
                        btn.classList.add('active');
                        btn.textContent = '🔴';
                    }
                    showToast('Listening... (2s pause to send)', 'success');
                };

                qaRecognition.onresult = function(event) {
                    var interim = '';
                    qaFinalTranscript = '';
                    for (var i = 0; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            qaFinalTranscript += event.results[i][0].transcript;
                        } else {
                            interim += event.results[i][0].transcript;
                        }
                    }
                    // Show what's being heard in the input field
                    var input = document.getElementById('qaInput');
                    if (input) {
                        input.value = (qaFinalTranscript + ' ' + interim).trim();
                    }
                    // Reset the 2-second timer on each result
                    if (qaVoiceTimeout) clearTimeout(qaVoiceTimeout);
                    qaVoiceTimeout = setTimeout(function() {
                        var fullText = stripFillerWords((qaFinalTranscript + ' ' + interim).trim());
                        if (fullText) {
                            // Stop recognition and submit
                            if (qaRecognition) {
                                try { qaRecognition.stop(); } catch(e) {}
                            }
                            submitQaQuestion(fullText);
                        }
                    }, 2000);
                };

                qaRecognition.onerror = function(event) {
                    if (qaVoiceTimeout) { clearTimeout(qaVoiceTimeout); qaVoiceTimeout = null; }
                    console.error('QA Speech error:', event.error);
                    if (event.error !== 'aborted' && event.error !== 'no-speech') {
                        showToast('Voice error: ' + event.error, 'error');
                    }
                    qaState.isVoiceActive = false;
                    if (btn) {
                        btn.classList.remove('active');
                        btn.textContent = '🎤';
                    }
                    // Restore main voice if needed
                    if (wasMainRecordingBeforeQa && recognition) {
                        wasMainRecordingBeforeQa = false;
                        setTimeout(function() {
                            isRecording = true;
                            recognition.start();
                            voiceBtn.classList.add('recording');
                            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                            voiceDots.classList.add('active');
                        }, 100);
                    }
                };

                qaRecognition.onend = function() {
                    // Don't clear timeout here - it may have triggered this onend
                    qaState.isVoiceActive = false;
                    if (btn) {
                        btn.classList.remove('active');
                        btn.textContent = '🎤';
                    }
                    // Restore main voice if needed
                    if (wasMainRecordingBeforeQa && recognition) {
                        wasMainRecordingBeforeQa = false;
                        setTimeout(function() {
                            isRecording = true;
                            recognition.start();
                            voiceBtn.classList.add('recording');
                            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                            voiceDots.classList.add('active');
                        }, 100);
                    }
                };

                try {
                    qaRecognition.start();
                } catch (e) {
                    showToast('Could not start voice: ' + e.message, 'error');
                    // Restore main voice on error
                    if (wasMainRecordingBeforeQa && recognition) {
                        wasMainRecordingBeforeQa = false;
                        isRecording = true;
                        recognition.start();
                        voiceBtn.classList.add('recording');
                        voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                        voiceDots.classList.add('active');
                    }
                }
            }, 300);
        }
    }
    window.toggleQaVoice = toggleQaVoice;

    // ========== FILE MODIFICATION & DIFF ==========
    var diffState = {
        isActive: false,
        originalContent: null,
        proposedContent: null,
        changeExplanation: null,
        diffLines: []
    };

    // Modification panel functions
    var modifyRecognition = null;
    var isModifyVoiceActive = false;

    function handleModifyKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitModifyRequest();
        }
    }
    window.handleModifyKeydown = handleModifyKeydown;

    function submitModifyRequest() {
        var input = document.getElementById('modifyInput');
        var instruction = input ? input.value.trim() : '';

        if (!instruction) {
            showToast('Enter a modification request', 'error');
            return;
        }

        if (!editorState.currentFile) {
            showToast('Open a file first', 'error');
            return;
        }

        // Clear input and show loading
        input.value = '';
        updateModifyStatus('Requesting changes...', 'loading');

        // Disable submit button
        var submitBtn = document.getElementById('modifySubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        requestFileModification(instruction);
    }
    window.submitModifyRequest = submitModifyRequest;

    function updateModifyStatus(message, type) {
        var statusEl = document.getElementById('modifyStatus');
        if (!statusEl) return;

        statusEl.textContent = message;
        statusEl.className = 'modify-status' + (type ? ' ' + type : '');
    }

    function toggleModifyVoice() {
        var btn = document.getElementById('modifyVoiceBtn');

        if (isModifyVoiceActive) {
            // Stop voice recognition
            if (modifyRecognition) {
                modifyRecognition.stop();
            }
            isModifyVoiceActive = false;
            if (btn) {
                btn.classList.remove('active');
                btn.textContent = '🎤';
            }
            showToast('Voice input stopped', 'success');
        } else {
            // Start voice recognition for modification
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                showToast('Voice recognition not supported', 'error');
                return;
            }

            var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            modifyRecognition = new SpeechRecognition();
            modifyRecognition.continuous = false;
            modifyRecognition.interimResults = false;
            modifyRecognition.lang = 'en-AU';

            modifyRecognition.onstart = function() {
                isModifyVoiceActive = true;
                if (btn) {
                    btn.classList.add('active');
                    btn.textContent = '🔴';
                }
                showToast('Listening... describe changes you want', 'success');
            };

            modifyRecognition.onresult = function(event) {
                var transcript = event.results[0][0].transcript;
                if (transcript && transcript.trim()) {
                    var input = document.getElementById('modifyInput');
                    if (input) {
                        input.value = transcript.trim();
                    }
                    // Auto-submit after voice input
                    submitModifyRequest();
                }
            };

            modifyRecognition.onerror = function(event) {
                console.error('Modify voice error:', event.error);
                if (event.error !== 'aborted') {
                    showToast('Voice error: ' + event.error, 'error');
                }
                isModifyVoiceActive = false;
                if (btn) {
                    btn.classList.remove('active');
                    btn.textContent = '🎤';
                }
            };

            modifyRecognition.onend = function() {
                isModifyVoiceActive = false;
                if (btn) {
                    btn.classList.remove('active');
                    btn.textContent = '🎤';
                }
            };

            try {
                modifyRecognition.start();
            } catch (e) {
                showToast('Could not start voice: ' + e.message, 'error');
            }
        }
    }
    window.toggleModifyVoice = toggleModifyVoice;

    async function requestFileModification(instruction) {
        if (!editorState.currentFile) {
            showToast('Open a file first', 'error');
            updateModifyStatus('', '');
            return;
        }

        var content = document.getElementById('editorTextarea').value;
        var project = document.getElementById('projectSelect').value;

        updateModifyStatus('Sending request to Claude...', 'loading');

        try {
            var res = await fetch('/api/file/modify', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    project: project,
                    path: editorState.currentFile,
                    content: content,
                    instruction: instruction
                })
            });
            var data = await res.json();

            if (!data.success || !data.job_id) {
                showToast('Error: ' + (data.error || 'Failed to start'), 'error');
                updateModifyStatus('Failed to start', 'error');
                enableModifyButton();
                return;
            }

            // Store original content
            diffState.originalContent = content;

            // Poll for result
            pollModifyResult(data.job_id);

        } catch (e) {
            showToast('Error: ' + e.message, 'error');
            updateModifyStatus('Error: ' + e.message, 'error');
            enableModifyButton();
        }
    }
    window.requestFileModification = requestFileModification;

    function enableModifyButton() {
        var submitBtn = document.getElementById('modifySubmitBtn');
        if (submitBtn) submitBtn.disabled = false;
    }

    async function pollModifyResult(jobId) {
        var pollCount = 0;
        var maxPolls = 180; // 3 minutes for modifications

        var poll = async function() {
            pollCount++;

            // Update status with progress
            var dots = '.'.repeat((pollCount % 3) + 1);
            updateModifyStatus('Claude is thinking' + dots, 'loading');

            if (pollCount > maxPolls) {
                showToast('Modification timed out', 'error');
                updateModifyStatus('Timed out', 'error');
                enableModifyButton();
                return;
            }

            try {
                var res = await fetch('/api/chat/status', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({job_id: jobId})
                });
                var data = await res.json();

                if (data.status === 'complete') {
                    var result = data.result || '';
                    updateModifyStatus('Changes ready - review below', 'success');
                    enableModifyButton();
                    parseAndShowDiff(result);
                } else if (data.status === 'error') {
                    showToast('Error: ' + (data.error || 'Unknown error'), 'error');
                    updateModifyStatus('Error: ' + (data.error || 'Unknown'), 'error');
                    enableModifyButton();
                } else {
                    setTimeout(poll, 1000);
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
                updateModifyStatus('Error: ' + e.message, 'error');
                enableModifyButton();
            }
        };

        setTimeout(poll, 1000);
    }

    function parseAndShowDiff(result) {
        // Parse the AI response to extract explanation and modified content
        var explanationMatch = result.match(/EXPLANATION:\s*([^\n]+)/);
        var modifiedMatch = result.match(/```modified\n([\s\S]*?)```/);

        if (!modifiedMatch) {
            // Try to extract any code block
            modifiedMatch = result.match(/```[\w]*\n([\s\S]*?)```/);
        }

        if (!modifiedMatch) {
            showToast('Could not parse modification result', 'error');
            updateModifyStatus('Could not parse result', 'error');
            return;
        }

        diffState.changeExplanation = explanationMatch ? explanationMatch[1].trim() : 'Changes applied as requested.';
        diffState.proposedContent = modifiedMatch[1];

        // Compute diff
        diffState.diffLines = computeLineDiff(diffState.originalContent, diffState.proposedContent);

        // Show diff modal
        showDiffModal();
    }

    function computeLineDiff(original, proposed) {
        var origLines = original.split('\n');
        var propLines = proposed.split('\n');
        var result = [];

        // Simple LCS-based diff
        var lcs = computeLCS(origLines, propLines);
        var i = 0, j = 0;

        lcs.forEach(function(match) {
            // Add removed lines before this match
            while (i < match.origIndex) {
                result.push({type: 'remove', line: origLines[i], origLineNum: i + 1});
                i++;
            }
            // Add added lines before this match
            while (j < match.propIndex) {
                result.push({type: 'add', line: propLines[j], propLineNum: j + 1});
                j++;
            }
            // Add matching line
            result.push({type: 'same', line: origLines[i], origLineNum: i + 1, propLineNum: j + 1});
            i++;
            j++;
        });

        // Handle remaining lines
        while (i < origLines.length) {
            result.push({type: 'remove', line: origLines[i], origLineNum: i + 1});
            i++;
        }
        while (j < propLines.length) {
            result.push({type: 'add', line: propLines[j], propLineNum: j + 1});
            j++;
        }

        return result;
    }

    function computeLCS(a, b) {
        // Build LCS table
        var m = a.length, n = b.length;
        var dp = [];
        for (var i = 0; i <= m; i++) {
            dp[i] = [];
            for (var j = 0; j <= n; j++) {
                dp[i][j] = 0;
            }
        }

        for (var i = 1; i <= m; i++) {
            for (var j = 1; j <= n; j++) {
                if (a[i-1] === b[j-1]) {
                    dp[i][j] = dp[i-1][j-1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
                }
            }
        }

        // Backtrack to find LCS positions
        var matches = [];
        var i = m, j = n;
        while (i > 0 && j > 0) {
            if (a[i-1] === b[j-1]) {
                matches.unshift({origIndex: i-1, propIndex: j-1});
                i--;
                j--;
            } else if (dp[i-1][j] > dp[i][j-1]) {
                i--;
            } else {
                j--;
            }
        }

        return matches;
    }

    function showDiffModal() {
        var modal = document.getElementById('diffModal');
        if (!modal) return;

        // Update explanation
        document.getElementById('diffExplanation').textContent = diffState.changeExplanation;

        // Count changes
        var added = 0, removed = 0;
        diffState.diffLines.forEach(function(d) {
            if (d.type === 'add') added++;
            if (d.type === 'remove') removed++;
        });
        document.getElementById('diffAddedCount').textContent = added;
        document.getElementById('diffRemovedCount').textContent = removed;

        // Render diff
        renderDiff();

        // Show modal
        modal.style.display = 'flex';
        diffState.isActive = true;
    }

    function renderDiff() {
        var origDiv = document.getElementById('diffOriginal');
        var propDiv = document.getElementById('diffProposed');

        var origHtml = '';
        var propHtml = '';

        diffState.diffLines.forEach(function(d) {
            var lineContent = escapeHtml(d.line);
            if (d.type === 'same') {
                origHtml += '<div class="diff-line same"><span class="diff-line-num">' + d.origLineNum + '</span>' + lineContent + '</div>';
                propHtml += '<div class="diff-line same"><span class="diff-line-num">' + d.propLineNum + '</span>' + lineContent + '</div>';
            } else if (d.type === 'remove') {
                origHtml += '<div class="diff-line remove"><span class="diff-line-num">' + d.origLineNum + '</span>' + lineContent + '</div>';
                propHtml += '<div class="diff-line spacer"><span class="diff-line-num"></span></div>';
            } else if (d.type === 'add') {
                origHtml += '<div class="diff-line spacer"><span class="diff-line-num"></span></div>';
                propHtml += '<div class="diff-line add"><span class="diff-line-num">' + d.propLineNum + '</span>' + lineContent + '</div>';
            }
        });

        origDiv.innerHTML = origHtml;
        propDiv.innerHTML = propHtml;

        // Sync scroll
        origDiv.onscroll = function() {
            propDiv.scrollTop = origDiv.scrollTop;
        };
        propDiv.onscroll = function() {
            origDiv.scrollTop = propDiv.scrollTop;
        };
    }

    function closeDiffModal() {
        var modal = document.getElementById('diffModal');
        if (modal) modal.style.display = 'none';
        diffState.isActive = false;
    }
    window.closeDiffModal = closeDiffModal;

    function acceptChanges() {
        if (!diffState.proposedContent) return;

        // Apply changes to editor
        var textarea = document.getElementById('editorTextarea');
        textarea.value = diffState.proposedContent;
        editorState.hasChanges = true;
        updateEditorLineNumbers();

        // Close modal
        closeDiffModal();

        // Clear diff state
        diffState.originalContent = null;
        diffState.proposedContent = null;
        diffState.diffLines = [];

        showToast('Changes applied', 'success');
        speak('Changes applied to file', 'axion');

        // Clear explanation cache since file changed
        var project = document.getElementById('projectSelect').value;
        if (editorState.currentFile) {
            var key = project + ':' + editorState.currentFile;
            delete explanationCache[key];
            localStorage.setItem('explanationCache', JSON.stringify(explanationCache));
        }
        explainState.cachedFile = null;
        explainState.cachedExplanation = null;
        explainState.cachedContentHash = null;

        // Regenerate explanation if panel is open
        if (explainState.isVisible) {
            generateExplanation();
        }
    }
    window.acceptChanges = acceptChanges;

    function revertChanges() {
        closeDiffModal();
        diffState.originalContent = null;
        diffState.proposedContent = null;
        diffState.diffLines = [];
        showToast('Changes reverted', 'success');
        speak('Changes reverted', 'axion');
    }
    window.revertChanges = revertChanges;

    function readDiffAloud() {
        if (!diffState.changeExplanation) return;

        var text = 'Proposed changes: ' + diffState.changeExplanation;
        var added = document.getElementById('diffAddedCount').textContent;
        var removed = document.getElementById('diffRemovedCount').textContent;
        text += '. ' + added + ' lines added, ' + removed + ' lines removed.';

        // Use the main speak() function which handles engine routing
        speak(text, 'axion');
    }
    window.readDiffAloud = readDiffAloud;

    // Clear explanation cache when file changes
    var originalOpenFileInEditor = window.openFileInEditor;
    window.openFileInEditor = async function(filePath) {
        await originalOpenFileInEditor(filePath);
        // If explain panel is visible, generate new explanation
        if (explainState.isVisible && editorState.currentFile !== explainState.cachedFile) {
            generateExplanation();
        }
    };

    // ========== INITIALIZATION ==========
    window.speechSynthesis.onvoiceschanged = populateVoices;

    loadProjects();
    initSidebar();
    checkHealth();

    // Initialize live box voice mode based on auto-read setting
    setTimeout(updateLiveBoxVoiceMode, 100);

    // Restore voice recording state from localStorage
    if (SR && localStorage.getItem('voiceEnabled') === 'true') {
        isRecording = true;
        recognition.start();
        voiceBtn.classList.add('recording');
        voiceBtn.textContent = '⏹';
        voiceDots.classList.add('active');
    }

    // Clear any persisted screenCleared state - it should not survive page loads
    // History will be loaded fresh by loadChatHistory() shortly after init
    localStorage.removeItem('screenCleared');

    // Reconnect to any active job on page load/refresh
    (async function() {
        // Wait a moment for projects to load
        await new Promise(function(resolve) { setTimeout(resolve, 500); });

        var persistedJobId = localStorage.getItem('chatRelayCurrentJobId');
        var persistedProject = localStorage.getItem('chatRelayCurrentJobProject');

        if (persistedJobId && persistedProject) {
            console.log('Found persisted job:', persistedJobId, 'for project:', persistedProject);

            // Verify the job is still active on the server
            try {
                var res = await fetch('/api/active/' + encodeURIComponent(persistedProject));
                var data = await res.json();

                if (data.active && data.job && data.job.id === persistedJobId) {
                    console.log('Reconnecting to active job:', persistedJobId);

                    // Restore state
                    currentJobId = persistedJobId;
                    currentJobProject = persistedProject;
                    currentJobTitle = localStorage.getItem('chatRelayCurrentJobTitle') || 'Task';
                    pendingUserMessage = data.job.message || '';

                    // Switch to the correct project if needed
                    var projectSelect = document.getElementById('projectSelect');
                    if (projectSelect.value !== persistedProject) {
                        projectSelect.value = persistedProject;
                    }

                    // Load chat history for this project
                    await loadChatHistory(persistedProject, false);

                    // Resume UI
                    startStreaming();
                    showLiveBox('Reconnecting...');
                    showAckBanner('Reconnecting to job ' + persistedJobId + '...', true);

                    // Start polling
                    startPolling(persistedJobId, persistedProject);

                    speak('Reconnected to ' + currentJobTitle, 'axion');
                } else {
                    // Job no longer active, clear persisted state
                    console.log('Persisted job no longer active, clearing state');
                    clearPersistedJobState();
                    currentJobId = null;
                    currentJobProject = null;
                    currentJobTitle = null;

                    // Load history for saved project
                    if (savedProject) {
                        loadChatHistory(savedProject, true);
                    }
                }
            } catch (err) {
                console.log('Error checking persisted job:', err);
                clearPersistedJobState();
                if (savedProject) {
                    loadChatHistory(savedProject, true);
                }
            }
        } else if (savedProject) {
            // No persisted job, just load chat history for saved project
            loadChatHistory(savedProject, true);
        }
    })();

    // Start polling
    setInterval(checkHealth, pollConfig.healthCheckInterval);
    setInterval(pollAxionMessages, pollConfig.axionMessagesInterval);

    // Show keyboard shortcuts hint briefly on load
    var hint = document.getElementById('shortcutsHint');
    if (hint) {
        setTimeout(function() { hint.classList.add('visible'); }, 1000);
        setTimeout(function() { hint.classList.remove('visible'); }, 5000);
    }
})();
