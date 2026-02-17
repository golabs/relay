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
    var currentUser = localStorage.getItem('chatRelayUser') || 'axion';
    var currentUserData = null;  // Loaded from /api/users, includes inputPanelName
    var chatHistory = [];
    var selectedHistoryIndex = -1;
    var sidebarCollapsed = localStorage.getItem('chatRelaySidebarCollapsed') === 'true';
    var selectedForDeletion = new Set();
    var pendingUserMessage = '';
    var pendingQuestions = null;
    var lastShownQuestionHash = null;  // Track to prevent duplicate question displays
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

    // ========== THEME SYSTEM ==========
    var currentTheme = localStorage.getItem('relayTheme') || 'dark';

    function getEffectiveTheme() {
        if (currentTheme === 'system') {
            return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        return currentTheme;
    }

    function setTheme(theme) {
        currentTheme = theme;
        localStorage.setItem('relayTheme', theme);
        var effective = getEffectiveTheme();
        document.documentElement.setAttribute('data-theme', effective === 'light' ? 'light' : '');

        // Update Highlight.js theme
        var hljsLink = document.getElementById('hljs-theme');
        if (hljsLink) {
            hljsLink.href = effective === 'light'
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
        }

        // Update theme button states
        updateThemeButtons();
        showToast('Theme: ' + theme.charAt(0).toUpperCase() + theme.slice(1), 'success');
    }
    window.setTheme = setTheme;

    function updateThemeButtons() {
        var buttons = ['themeDark', 'themeLight', 'themeSystem'];
        buttons.forEach(function(id) {
            var btn = document.getElementById(id);
            if (btn) btn.classList.remove('primary');
        });
        var activeId = 'theme' + currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
        var activeBtn = document.getElementById(activeId);
        if (activeBtn) activeBtn.classList.add('primary');
    }

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function() {
        if (currentTheme === 'system') {
            var effective = getEffectiveTheme();
            document.documentElement.setAttribute('data-theme', effective === 'light' ? 'light' : '');
        }
    });

    // ========== DISPLAY SETTINGS ==========
    var displaySettings = JSON.parse(localStorage.getItem('chatRelayDisplay') || '{}');
    if (!displaySettings.axionFontSize) displaySettings.axionFontSize = 14;
    if (!displaySettings.brettFontSize) displaySettings.brettFontSize = 14;
    if (!displaySettings.editorFontSize) displaySettings.editorFontSize = 14;
    if (!displaySettings.explainFontSize) displaySettings.explainFontSize = 14;
    if (!displaySettings.fileTreeFontSize) displaySettings.fileTreeFontSize = 13;

    // ========== PERSONALITY SYSTEM ==========
    var currentPersonality = localStorage.getItem('chatRelayPersonality') || 'neutral';
    // Auto-sync personality based on current TTS engine
    // ElevenLabs has its own personality dropdown, others use shared personality
    if (voiceSettings.engine === 'elevenlabs' && voiceSettings.elevenPersonality) {
        currentPersonality = voiceSettings.elevenPersonality;
        localStorage.setItem('chatRelayPersonality', currentPersonality);
    } else if (voiceSettings.engine !== 'elevenlabs') {
        // For non-ElevenLabs engines, use shared personality or reset to neutral
        currentPersonality = voiceSettings.sharedPersonality || 'neutral';
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
    function applyAxionFontSize(size) {
        var px = size + 'px';
        if (responseArea) {
            responseArea.style.setProperty('font-size', px, 'important');
            // Also set on child message elements so they inherit properly
            responseArea.querySelectorAll('.message-assistant, .message-user, .message-body').forEach(function(el) {
                el.style.setProperty('font-size', px, 'important');
            });
        }
        if (liveActivityContent) {
            liveActivityContent.style.setProperty('font-size', px, 'important');
            liveActivityContent.querySelectorAll('.message-assistant, .message-user, .message-body').forEach(function(el) {
                el.style.setProperty('font-size', px, 'important');
            });
        }
    }

    function applyDisplaySettings() {
        applyAxionFontSize(displaySettings.axionFontSize);
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

    // Initialize mobile panel state - hide AXION on mobile by default (BRETT is default)
    function initMobilePanelState() {
        if (window.innerWidth <= 768) {
            var axionPane = document.getElementById('axionPane');
            var label = document.getElementById('mobilePanelLabel');
            if (axionPane) {
                axionPane.classList.add('mobile-hidden');
            }
            if (label) {
                label.textContent = 'BRETT';
            }
        }
    }
    document.addEventListener('DOMContentLoaded', initMobilePanelState);
    // Also handle resize events
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            // Remove mobile-hidden class when switching to desktop
            var axionPane = document.getElementById('axionPane');
            var brettPane = document.getElementById('brettPane');
            if (axionPane) axionPane.classList.remove('mobile-hidden');
            if (brettPane) brettPane.classList.remove('mobile-hidden');
        }
    });

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
            // If content contains user message ("You:"), show it directly without filtering
            if (content && content.includes('message-user')) {
                // Force show content even if voice mode is on - user message is important
                liveActivityContent.classList.remove('voice-mode');
                var visualizer = document.getElementById('liveVoiceVisualizer');
                if (visualizer) visualizer.classList.remove('active');
                liveActivityContent.innerHTML = content;
            } else {
                // Add personality to live content - only show if meaningful
                var personalizedContent = addPersonalityToContent(content);
                // Only update if we have actual content (not just action noise)
                if (personalizedContent) {
                    liveActivityContent.innerHTML = personalizedContent;
                }
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
            var progressHtml = '<div class="streaming-progress" style="border-left:3px solid var(--accent);padding-left:12px;margin-bottom:16px;color:#ffffff;">' +
                '<div class="message-user" style="margin-bottom:8px;color:#00f0ff;"><strong>You:</strong><br>' + renderMarkdown(userMessage) + '</div>' +
                '<div class="message-assistant" style="color:#ffffff;"><strong>Axion (streaming...):</strong><br>' + renderMarkdown(previousStreamText) + '</div>' +
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

        // Auto-switch to AXION panel on mobile when streaming starts
        if (typeof autoSwitchToAxionOnMobile === 'function') {
            autoSwitchToAxionOnMobile();
        }

        // Show quick message button
        updateQuickMsgButton();

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

    // LIVE box is now inside AXION - no dragging needed

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

    // ========== MODEL SELECTION ==========
    var currentModel = 'claude';  // Default to Claude CLI

    function getSelectedModel() {
        var desktop = document.getElementById('modelSelect');
        var mobile = document.getElementById('modelSelectMobile');
        return (desktop && desktop.value) || (mobile && mobile.value) || 'claude';
    }

    // Sync both desktop and mobile model selects
    function syncModelSelects(modelId) {
        var desktop = document.getElementById('modelSelect');
        var mobile = document.getElementById('modelSelectMobile');
        if (desktop) desktop.value = modelId;
        if (mobile) mobile.value = modelId;
    }

    async function switchModel(modelId) {
        currentModel = modelId;
        localStorage.setItem('selectedModel', modelId);

        // Update both desktop and mobile selects
        syncModelSelects(modelId);

        // Announce model switch
        var modelName = modelId === 'claude' ? 'Claude' : modelId.split('/').pop();
        showToast('Switched to ' + modelName, 'success');

        // Save preference to server
        try {
            await fetch('/api/model/set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId })
            });
        } catch (e) {
            console.log('Model preference save failed:', e);
        }
    }

    // Load saved model preference
    function loadModelPreference() {
        var saved = localStorage.getItem('selectedModel');
        if (saved) {
            currentModel = saved;
            syncModelSelects(saved);
        }
    }

    // Expose globally
    window.switchModel = switchModel;
    window.getSelectedModel = getSelectedModel;

    // ========== PROJECT LOADING ==========
    // Helper to get current project from either select
    function getSelectedProject() {
        var desktop = document.getElementById('projectSelect');
        var mobile = document.getElementById('projectSelectMobile');
        return (desktop && desktop.value) || (mobile && mobile.value) || '';
    }

    // Sync both selects
    function syncProjectSelects(value) {
        var desktop = document.getElementById('projectSelect');
        var mobile = document.getElementById('projectSelectMobile');
        if (desktop) desktop.value = value;
        if (mobile) mobile.value = value;
    }

    // ========== USER MANAGEMENT ==========

    async function loadUsers() {
        try {
            var res = await fetch('/api/users');
            var data = await res.json();

            // Store current user data
            currentUserData = data.users.find(function(u) { return u.id === currentUser; });
            if (!currentUserData) {
                currentUserData = data.users[0]; // fallback to first user
            }

            // Update panel name dynamically
            updateInputPanelName();

            var selects = [
                document.getElementById('userSelect'),
                document.getElementById('userSelectMobile')
            ].filter(Boolean);

            selects.forEach(function(select) {
                while (select.firstChild) select.removeChild(select.firstChild);
                data.users.forEach(function(u) {
                    var opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = u.name + (u.admin ? ' ★' : '');
                    if (u.id === currentUser) opt.selected = true;
                    select.appendChild(opt);
                });
            });
        } catch (e) {
            console.log('Failed to load users:', e);
        }
    }

    function updateInputPanelName() {
        if (!currentUserData) return;

        var panelName = currentUserData.inputPanelName || 'BRETT';

        // Update the panel header
        var brettPaneHeader = document.querySelector('#brettPane .pane-header span');
        if (brettPaneHeader) {
            brettPaneHeader.textContent = panelName;
        }

        // Update display settings labels
        var brettSizeHeader = document.querySelector('label[for="brettFontSize"]');
        if (brettSizeHeader) {
            brettSizeHeader.innerHTML = panelName + ' Font Size: <span id="brettSizeLabel">14px</span>';
        }

        // Update voice settings labels (multiple TTS engines)
        var voiceLabels = [
            { selector: 'label[for="brettEdgeVoice"]', text: panelName + ' Edge Voice:' },
            { selector: 'label[for="brettPiperVoice"]', text: panelName + ' Piper Voice:' },
            { selector: 'label[for="brettElevenVoice"]', text: panelName + ' ElevenLabs Voice:' },
            { selector: 'label[for="brettVoice"]', text: panelName + ' Voice:' }
        ];

        voiceLabels.forEach(function(item) {
            var label = document.querySelector(item.selector);
            if (label) label.textContent = item.text;
        });

        // Update test buttons
        var testButtons = document.querySelectorAll('button[onclick*="brett"]');
        testButtons.forEach(function(btn) {
            var text = btn.textContent;
            if (text.includes('BRETT')) {
                btn.textContent = text.replace('BRETT', panelName);
            }
        });

        // Update help modal text
        var helpTexts = [
            { id: 'helpClearInput', text: 'Clear ' + panelName + ' input' },
            { id: 'helpReadInput', text: 'Read ' + panelName + ' aloud' },
            { id: 'helpAxionRead', text: 'Read Axion aloud (pauses ' + panelName + ' voice)' }
        ];

        helpTexts.forEach(function(item) {
            var el = document.getElementById(item.id);
            if (el) el.textContent = item.text;
        });
    }

    async function switchUser(userId) {
        currentUser = userId;
        localStorage.setItem('chatRelayUser', userId);

        // Sync both user selects
        ['userSelect', 'userSelectMobile'].forEach(function(id) {
            var sel = document.getElementById(id);
            if (sel) sel.value = userId;
        });

        // Reload user data to get new panel name
        await loadUsers();

        // Reload projects for this user
        loadProjects();
        showToast('Switched to ' + userId, 'success');
    }
    window.switchUser = switchUser;

    async function loadProjects() {
        try {
            var url = '/api/projects';
            if (currentUser) url += '?user=' + encodeURIComponent(currentUser);
            var res = await fetch(url);
            var data = await res.json();
            var selects = [
                document.getElementById('projectSelect'),
                document.getElementById('projectSelectMobile')
            ].filter(Boolean);

            selects.forEach(function(select) {
                // Clear existing options
                while (select.firstChild) {
                    select.removeChild(select.firstChild);
                }
                // Add default option
                var defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = 'No Project';
                select.appendChild(defaultOpt);
                // Add project options - use path as value, display as label
                data.projects.forEach(function(p) {
                    var opt = document.createElement('option');
                    // p is now an object: {name, path, owner, display}
                    if (typeof p === 'object') {
                        opt.value = p.path;
                        opt.textContent = p.display;
                        if (p.path === savedProject) opt.selected = true;
                    } else {
                        // Backwards compatibility if API returns strings
                        opt.value = p;
                        opt.textContent = p;
                        if (p === savedProject) opt.selected = true;
                    }
                    select.appendChild(opt);
                });
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
                startPolling(job.id, project);
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

    // Escape HTML but also convert URLs to clickable links (for user messages)
    function escapeHtmlWithLinks(text) {
        if (!text) return '';
        // First escape HTML
        var escaped = escapeHtml(text);
        // Then convert URLs to clickable links
        // Match http:// and https:// URLs
        escaped = escaped.replace(/(https?:\/\/[^\s<>"')\]]+)/g, function(url) {
            return '<a href="' + url + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">' + url + '</a>';
        });
        return escaped;
    }

    // Extract meaningful preview from user message, stripping system prompts
    function extractMessagePreview(text, maxLength) {
        maxLength = maxLength || 60;
        if (!text) return '';

        var cleaned = text;

        // Remove common system prompt patterns that appear before user's actual message
        // Pattern: [AGENT MODE: ...] ...
        cleaned = cleaned.replace(/^\s*\[AGENT MODE:[^\]]*\][^]*?(?=\n\n|\r\n\r\n)/i, '');

        // Pattern: ---\nIMPORTANT RESPONSE GUIDELINES:...\n---
        cleaned = cleaned.replace(/---[\s\S]*?IMPORTANT RESPONSE GUIDELINES[\s\S]*?---\s*/gi, '');

        // Pattern: <system-reminder>...</system-reminder>
        cleaned = cleaned.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '');

        // Pattern: Use the Task tool with subagent_type=... (system instructions)
        cleaned = cleaned.replace(/Use the Task tool with subagent_type[^\n]*\n*/gi, '');

        // Remove leading/trailing whitespace and newlines
        cleaned = cleaned.trim();

        // If we stripped everything, fall back to original but try to find user content
        if (!cleaned || cleaned.length < 5) {
            // Try to find content after double newline (common separator)
            var parts = text.split(/\n\n+/);
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i].trim();
                // Skip parts that look like system prompts
                if (part && !part.startsWith('[AGENT') && !part.startsWith('---') &&
                    !part.startsWith('<') && !part.startsWith('Use the Task')) {
                    cleaned = part;
                    break;
                }
            }
        }

        // Still nothing? Use original
        if (!cleaned) cleaned = text.trim();

        // Truncate and add ellipsis if needed
        if (cleaned.length > maxLength) {
            // Try to cut at a word boundary
            var cutPoint = cleaned.lastIndexOf(' ', maxLength);
            if (cutPoint < maxLength * 0.6) cutPoint = maxLength;
            return cleaned.substring(0, cutPoint).trim() + '...';
        }

        return cleaned;
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
            var preview = extractMessagePreview(entry.user, 60);
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

        // Also update mobile history list if on mobile
        if (window.innerWidth <= 768 && typeof renderMobileHistoryList === 'function') {
            renderMobileHistoryList();
        }

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
                '<div class="message-user" style="color:#00f0ff;"><strong>You:</strong><br>' + renderMarkdown(entry.user) + '</div>' +
                '<div class="message-assistant" style="color:#ffffff;"><strong>Axion:</strong><br>' + renderMarkdown(entry.assistant) + '</div>' +
                '</div>';
            responseArea.innerHTML = html;
        } else {
            var html = chatHistory.map(function(entry, idx) {
                var dt = new Date(entry.timestamp * 1000);
                var timeStr = dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                var dateStr = dt.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + timeStr;
                return '<div class="message-entry" style="cursor:pointer;" onclick="selectHistoryItem(' + idx + ')">' +
                    '<div class="message-header"><span class="message-time">' + dateStr + '</span></div>' +
                    '<div class="message-user" style="color:#00f0ff;"><strong>You:</strong><br>' + renderMarkdown(entry.user) + '</div>' +
                    '<div class="message-assistant" style="color:#ffffff;"><strong>Axion:</strong><br>' + renderMarkdown(entry.assistant) + '</div>' +
                '</div>';
            }).join('');
            responseArea.innerHTML = html;
        }
        renderHistorySidebar();
        addCopyButtons();
        renderMermaidDiagrams();
        applyAxionFontSize(displaySettings.axionFontSize);

        // Scroll after all rendering is complete - use setTimeout to ensure DOM updates are flushed
        setTimeout(function() {
            if (selectedHistoryIndex < 0) {
                // Scroll to bottom when showing all history
                responsePane.scrollTop = responsePane.scrollHeight;
            } else {
                // Scroll to top when viewing a selected history item
                responsePane.scrollTop = 0;
            }
        }, 10);
    }

    // Render a specific history item, bypassing streaming check
    // This allows users to view history while a job is running
    function renderSelectedHistoryItem(index) {
        if (index < 0 || index >= chatHistory.length) {
            console.log('renderSelectedHistoryItem: index out of range', index);
            return;
        }
        var entry = chatHistory[index];
        var dt = new Date(entry.timestamp * 1000);
        var timeStr = dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        var dateStr = dt.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + timeStr;
        var html = '<div style="margin-bottom:12px;">' +
            '<button class="btn" onclick="showAllHistory()">&larr; Back to all</button>' +
            '</div>' +
            '<div class="message-entry">' +
            '<div class="message-header"><span class="message-time">' + dateStr + '</span></div>' +
            '<div class="message-user" style="color:#00f0ff;"><strong>You:</strong><br>' + renderMarkdown(entry.user) + '</div>' +
            '<div class="message-assistant" style="color:#ffffff;"><strong>Axion:</strong><br>' + renderMarkdown(entry.assistant) + '</div>' +
            '</div>';
        responseArea.innerHTML = html;
        addCopyButtons();
        renderMermaidDiagrams();
        applyAxionFontSize(displaySettings.axionFontSize);
    }

    function selectHistoryItem(index) {
        selectedHistoryIndex = index;
        // Reset screenCleared so the selected item actually displays
        if (screenCleared) {
            screenCleared = false;
            localStorage.removeItem('screenCleared');
        }
        renderHistorySidebar();

        // Force render the selected history item even if streaming
        // User should be able to view history while a job runs
        renderSelectedHistoryItem(index);

        // Save active context for Claude to reference
        var projectSelect = document.getElementById('projectSelect');
        var projectForContext = (projectSelect && projectSelect.value) || 'relay';
        console.log('selectHistoryItem: index=' + index + ', chatHistory.length=' + chatHistory.length + ', project=' + projectForContext);
        if (index >= 0 && index < chatHistory.length) {
            var entry = chatHistory[index];
            console.log('Saving context for entry:', entry.user ? entry.user.substring(0, 50) : 'none');
            saveActiveContext(projectForContext, entry.user, entry.assistant);
        } else {
            console.warn('selectHistoryItem: index out of bounds or chatHistory empty');
        }
    }
    window.selectHistoryItem = selectHistoryItem;

    function saveActiveContext(project, userMsg, assistantMsg) {
        console.log('saveActiveContext called:', project, userMsg ? userMsg.substring(0, 50) : 'none');
        fetch('/api/context/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: project,
                user: userMsg,
                assistant: assistantMsg,
                title: 'Currently Viewed Conversation'
            })
        }).catch(function(e) { console.warn('Context save failed:', e); });
    }

    function clearActiveContext(project) {
        if (!project) return;
        fetch('/api/context/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: project })
        }).catch(function(e) { console.warn('Context clear failed:', e); });
    }

    function showAllHistory() {
        selectedHistoryIndex = -1;
        // Clear active context when going back to list view
        var projectSelect = document.getElementById('projectSelect');
        var proj = (projectSelect && projectSelect.value) || 'relay';
        clearActiveContext(proj);
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
        if (!btn || !countSpan) {
            console.warn('Delete button elements not found:', { btn: !!btn, countSpan: !!countSpan });
            return;
        }
        var count = selectedForDeletion.size;
        countSpan.textContent = count;
        console.log('updateDeleteButton: count=' + count, 'adding visible=' + (count > 0));
        if (count > 0) {
            btn.classList.add('visible');
            btn.style.display = 'block'; // Force display as backup
        } else {
            btn.classList.remove('visible');
            btn.style.display = 'none';
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

    // ========== IMAGE HISTORY MODE ==========
    var historyMode = localStorage.getItem('historyMode') || 'chat'; // 'chat' or 'images'
    var generatedImages = JSON.parse(localStorage.getItem('generatedImages') || '[]');

    function toggleHistoryMode() {
        historyMode = historyMode === 'chat' ? 'images' : 'chat';
        localStorage.setItem('historyMode', historyMode);
        updateHistoryModeUI();
        if (historyMode === 'images') {
            loadAndRenderImageHistory();
        } else {
            renderHistorySidebar();
        }
    }
    window.toggleHistoryMode = toggleHistoryMode;

    function updateHistoryModeUI() {
        var toggleBtn = document.getElementById('historyModeToggle');
        var title = document.getElementById('historyPaneTitle');
        var deleteBtn = document.getElementById('deleteSelectedBtn');
        var clearBtn = document.querySelector('[onclick="clearHistory()"]');

        if (historyMode === 'images') {
            toggleBtn.textContent = '💬';
            toggleBtn.title = 'Switch to Chat History';
            title.textContent = 'Generated Images';
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (clearBtn) clearBtn.textContent = 'Clear Image History';
        } else {
            toggleBtn.textContent = '🖼';
            toggleBtn.title = 'Switch to Image History';
            title.textContent = 'History';
            if (deleteBtn) deleteBtn.style.display = '';
            if (clearBtn) clearBtn.textContent = 'Clear All History';
        }
    }

    function loadAndRenderImageHistory() {
        var historyList = document.getElementById('historyList');
        var historyCount = document.getElementById('historyCount');

        // Fetch images from the server screenshots directory
        fetch('/api/screenshots')
            .then(function(r) { return r.json(); })
            .catch(function() { return { screenshots: [] }; })
            .then(function(data) {
                var images = (data.screenshots || []).filter(function(img) {
                    // Filter for generated images (DALL-E, etc.)
                    return img.name && (img.name.startsWith('dalle_') || img.name.includes('generated'));
                });

                if (images.length === 0) {
                    historyList.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:20px;">No generated images yet</div>';
                    historyCount.textContent = '';
                    return;
                }

                // Sort by most recent
                images.sort(function(a, b) { return (b.modified || 0) - (a.modified || 0); });

                var html = '';
                images.forEach(function(img, idx) {
                    var date = img.modified ? new Date(img.modified * 1000).toLocaleString() : 'Unknown';
                    html += '<div class="image-history-item" data-url="' + img.url + '" style="' +
                        'padding:8px;margin-bottom:8px;background:rgba(0,20,40,0.6);border:1px solid var(--border);border-radius:8px;cursor:pointer;position:relative;">' +
                        '<img src="' + img.url + '" style="width:100%;height:80px;object-fit:cover;border-radius:4px;" onclick="openLightbox(\'' + img.url + '\')" title="Click to view full size">' +
                        '<div style="font-size:0.75rem;color:#888;margin-top:4px;">' + date + '</div>' +
                        '<div style="font-size:0.7rem;color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + img.name + '">' + img.name + '</div>' +
                        '<button onclick="deleteGeneratedImage(\'' + img.name + '\', event)" style="' +
                            'position:absolute;top:4px;right:4px;background:#ff4444;border:none;color:white;' +
                            'width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:12px;' +
                            'display:flex;align-items:center;justify-content:center;" title="Delete image">&times;</button>' +
                        '</div>';
                });

                historyList.innerHTML = html;
                historyCount.textContent = images.length + ' image' + (images.length === 1 ? '' : 's');
            });
    }

    function deleteGeneratedImage(filename, event) {
        if (event) event.stopPropagation();
        if (!confirm('Delete this image?')) return;

        fetch('/api/screenshots/' + encodeURIComponent(filename), { method: 'DELETE' })
            .then(function(r) {
                if (r.ok) {
                    showToast('Image deleted', 'success');
                    loadAndRenderImageHistory();
                } else {
                    showToast('Failed to delete image', 'error');
                }
            })
            .catch(function() {
                showToast('Failed to delete image', 'error');
            });
    }
    window.deleteGeneratedImage = deleteGeneratedImage;

    // Track generated images when they're created
    function trackGeneratedImage(imageData) {
        generatedImages.unshift({
            url: imageData.preview_url || imageData.local_url || imageData.url,
            prompt: imageData.prompt,
            timestamp: Date.now(),
            provider: imageData.provider,
            model: imageData.model
        });
        // Keep last 100 images
        if (generatedImages.length > 100) {
            generatedImages = generatedImages.slice(0, 100);
        }
        localStorage.setItem('generatedImages', JSON.stringify(generatedImages));
    }
    window.trackGeneratedImage = trackGeneratedImage;

    // Initialize history mode on load
    function initHistoryMode() {
        updateHistoryModeUI();
        if (historyMode === 'images') {
            loadAndRenderImageHistory();
        }
    }

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

    // Mobile panel switcher - toggle between AXION and BRETT panels
    var mobileActivePanel = 'brett'; // 'axion' or 'brett' - BRETT is default on mobile
    function toggleMobilePanel() {
        var axionPane = document.getElementById('axionPane');
        var brettPane = document.getElementById('brettPane');
        var label = document.getElementById('mobilePanelLabel');

        if (mobileActivePanel === 'axion') {
            // Switch to BRETT
            mobileActivePanel = 'brett';
            axionPane.classList.add('mobile-hidden');
            brettPane.classList.remove('mobile-hidden');
            label.textContent = 'BRETT';
        } else {
            // Switch to AXION
            mobileActivePanel = 'axion';
            brettPane.classList.add('mobile-hidden');
            axionPane.classList.remove('mobile-hidden');
            label.textContent = 'AXION';
        }
    }
    window.toggleMobilePanel = toggleMobilePanel;

    // Auto-switch to AXION when response starts streaming (mobile)
    function autoSwitchToAxionOnMobile() {
        if (window.innerWidth <= 768 && mobileActivePanel !== 'axion') {
            toggleMobilePanel();
        }
    }
    window.autoSwitchToAxionOnMobile = autoSwitchToAxionOnMobile;

    // ========== AXION MOBILE TABS (Response/History) ==========
    var axionMobileTab = 'response'; // 'response' or 'history'
    var mobileSelectedHistoryIndices = [];

    function switchAxionMobileTab(tab) {
        axionMobileTab = tab;
        var axionPane = document.getElementById('axionPane');
        var tabs = document.querySelectorAll('.axion-tab');

        // Update tab button states
        tabs.forEach(function(t) {
            t.classList.remove('active');
            if (t.dataset.tab === tab) {
                t.classList.add('active');
            }
        });

        if (tab === 'history') {
            axionPane.classList.add('history-tab-active');
            renderMobileHistoryList();
        } else {
            axionPane.classList.remove('history-tab-active');
        }
    }
    window.switchAxionMobileTab = switchAxionMobileTab;

    function renderMobileHistoryList() {
        var listContainer = document.getElementById('mobileHistoryList');
        var loadBtn = document.getElementById('mobileLoadHistoryBtn');
        var deleteBtn = document.getElementById('mobileDeleteHistoryBtn');

        if (!chatHistory || chatHistory.length === 0) {
            listContainer.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px 20px;">No history yet.<br><br>Start a conversation to see it here.</div>';
            loadBtn.disabled = true;
            deleteBtn.disabled = true;
            return;
        }

        // Render history items (newest first)
        var html = '';
        for (var i = chatHistory.length - 1; i >= 0; i--) {
            var entry = chatHistory[i];
            var timestamp = new Date(entry.timestamp * 1000);
            var timeStr = timestamp.toLocaleDateString() + ' ' + timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            var preview = (entry.user || '').substring(0, 80);
            if ((entry.user || '').length > 80) preview += '...';
            var isSelected = mobileSelectedHistoryIndices.indexOf(i) !== -1;

            html += '<div class="mobile-history-item' + (isSelected ? ' selected' : '') + '" data-index="' + i + '" onclick="toggleMobileHistoryItem(' + i + ')">';
            html += '<div class="mobile-history-item-header">';
            html += '<span class="mobile-history-item-time">' + escapeHtml(timeStr) + '</span>';
            html += '<input type="checkbox" class="mobile-history-item-checkbox" ' + (isSelected ? 'checked' : '') + ' onclick="event.stopPropagation(); toggleMobileHistoryCheckbox(' + i + ', this)">';
            html += '</div>';
            html += '<div class="mobile-history-item-preview">' + escapeHtml(preview) + '</div>';
            html += '</div>';
        }

        listContainer.innerHTML = html;
        updateMobileHistoryButtons();
    }
    window.renderMobileHistoryList = renderMobileHistoryList;

    function toggleMobileHistoryItem(index) {
        // Single tap loads the history item directly into AXION
        mobileSelectedHistoryIndices = [index];

        // Switch to Response tab and load the history item
        switchAxionMobileTab('response');
        selectHistoryItem(index); // Display in AXION
        mobileSelectedHistoryIndices = [];
    }
    window.toggleMobileHistoryItem = toggleMobileHistoryItem;

    function toggleMobileHistoryCheckbox(index, checkbox) {
        var idx = mobileSelectedHistoryIndices.indexOf(index);
        if (checkbox.checked) {
            if (idx === -1) mobileSelectedHistoryIndices.push(index);
        } else {
            if (idx !== -1) mobileSelectedHistoryIndices.splice(idx, 1);
        }
        updateMobileHistoryButtons();
        // Update visual selection
        var items = document.querySelectorAll('.mobile-history-item');
        items.forEach(function(item) {
            var itemIndex = parseInt(item.dataset.index);
            if (mobileSelectedHistoryIndices.indexOf(itemIndex) !== -1) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    window.toggleMobileHistoryCheckbox = toggleMobileHistoryCheckbox;

    function updateMobileHistoryButtons() {
        var loadBtn = document.getElementById('mobileLoadHistoryBtn');
        var deleteBtn = document.getElementById('mobileDeleteHistoryBtn');
        var count = mobileSelectedHistoryIndices.length;

        loadBtn.disabled = count !== 1; // Can only load one at a time
        loadBtn.textContent = count === 1 ? 'Load Selected' : 'Load Selected';
        deleteBtn.disabled = count === 0;
        deleteBtn.textContent = count > 0 ? 'Delete (' + count + ')' : 'Delete Selected';
    }

    function loadHistoryItemMobile() {
        if (mobileSelectedHistoryIndices.length !== 1) return;
        var index = mobileSelectedHistoryIndices[0];

        // Switch back to response tab and show the history item
        switchAxionMobileTab('response');
        selectHistoryItem(index); // Use existing function to display in AXION
        mobileSelectedHistoryIndices = [];
    }
    window.loadHistoryItemMobile = loadHistoryItemMobile;

    function deleteSelectedHistoryMobile() {
        if (mobileSelectedHistoryIndices.length === 0) return;

        var count = mobileSelectedHistoryIndices.length;
        if (!confirm('Delete ' + count + ' history item' + (count > 1 ? 's' : '') + '?')) return;

        var project = document.getElementById('projectSelect').value;
        if (!project) return;

        // Sort indices in descending order for safe deletion
        var sortedIndices = mobileSelectedHistoryIndices.slice().sort(function(a, b) { return b - a; });

        fetch('/api/history/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: project, indices: sortedIndices })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.status === 'deleted') {
                showToast('Deleted ' + count + ' item' + (count > 1 ? 's' : ''), 'success');
                mobileSelectedHistoryIndices = [];
                loadChatHistory(project, false); // Reload history
            } else {
                showToast('Delete failed', 'error');
            }
        })
        .catch(function(err) {
            showToast('Error: ' + err.message, 'error');
        });
    }
    window.deleteSelectedHistoryMobile = deleteSelectedHistoryMobile;

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


        // Handle Mermaid diagram blocks - extract before code block processing
        var mermaidBlocks = [];
        text = text.replace(/```mermaid\n([\s\S]*?)```/g, function(match, code) {
            var id = 'mermaid-' + Date.now() + '-' + mermaidBlocks.length;
            mermaidBlocks.push({ id: id, code: code.trim() });
            return '[[MERMAID_BLOCK_' + (mermaidBlocks.length - 1) + ']]';
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
            // Trim any trailing punctuation that shouldn't be part of URL
            var cleanUrl = link.url.trim();
            if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
                // Encode special characters but preserve URL structure
                var safeUrl = cleanUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                return '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;" title="' + safeUrl + '">' + link.text + '</a>';
            }
            return '<a href="#" onclick="openFileOrLink(\'' + link.url.replace(/'/g, "\\'") + '\'); return false;" style="color:var(--accent);text-decoration:underline;cursor:pointer;" title="Open: ' + link.url + '">' + link.text + '</a>';
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
        text = text.replace(/(?<![="'>\/])(https?:\/\/[^\s<>"')\]]+)/g, function(match, url) {
            // Don't double-link URLs already inside <a> tags
            // Clean up trailing punctuation that's not part of URL
            var cleanUrl = url.replace(/[.,;:!?)]+$/, '');
            var safeUrl = cleanUrl.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            return '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;">' + cleanUrl + '</a>';
        });

        // Markdown tables → HTML tables
        text = text.replace(/((?:^\|.+\|[ ]*$\n?)+)/gm, function(tableBlock) {
            var rows = tableBlock.trim().split('\n');
            if (rows.length < 2) return tableBlock;
            var html = '<table class="md-table">';
            var isHeader = true;
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r].trim();
                if (/^\|[\s\-:|]+\|$/.test(row)) { isHeader = false; continue; }
                var cells = row.split('|').filter(function(c, i, a) { return i > 0 && i < a.length - 1; });
                var tag = isHeader ? 'th' : 'td';
                html += '<tr>';
                for (var c = 0; c < cells.length; c++) {
                    html += '<' + tag + '>' + cells[c].trim() + '</' + tag + '>';
                }
                html += '</tr>';
                if (isHeader) isHeader = false;
            }
            html += '</table>';
            return html;
        });

        // Headers
        text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold and italic
        // Note: Be careful not to match asterisks in file paths like "*.png" or "claims_ai_*.png"
        text = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
        // For italic, require space or start of line before opening *, and space/punctuation after closing *
        // This prevents matching glob patterns like *.png or file_*.txt
        text = text.replace(/(?:^|[\s(])\*([^*\n]+?)\*(?=[\s.,;:!?)}\]]|$)/gm, function(match, content) {
            // Don't convert if it looks like a file glob pattern
            if (/\.\w+$/.test(content) || /^[._\w/-]+$/.test(content)) {
                return match; // Return unchanged
            }
            return match.replace('*' + content + '*', '<em>' + content + '</em>');
        });

        // Lists
        text = text.replace(/^- (.+)$/gm, '<li>$1</li>');

        // Newlines
        text = text.replace(/\n/g, '<br>');

        // Restore Mermaid blocks AFTER newline conversion (to preserve diagram syntax)
        text = text.replace(/\[\[MERMAID_BLOCK_(\d+)\]\]/g, function(match, idx) {
            var block = mermaidBlocks[parseInt(idx)];
            return '<div class="mermaid-container">' +
                   '<button class="mermaid-expand-btn" onclick="openMermaidFullscreen(this.parentNode)" title="Expand diagram">⛶</button>' +
                   '<pre class="mermaid" id="' + block.id + '">' + block.code + '</pre></div>';
        });

        return text;
    }

    // Render Mermaid diagrams after DOM update
    function renderMermaidDiagrams() {
        if (typeof mermaid === 'undefined') return;
        try {
            mermaid.run({ nodes: document.querySelectorAll('pre.mermaid:not([data-processed])') });
            // After rendering, set up interactive features
            setTimeout(function() {
                setupInteractiveDiagrams();
            }, 100);
        } catch (e) {
            console.warn('Mermaid render error:', e);
        }
    }

    // ========== INTERACTIVE DIAGRAM SYSTEM ==========
    // Store for diagram node metadata (populated via special syntax in mermaid code)
    var diagramNodeData = {};
    var currentDiagramTooltip = null;

    // Parse node data from mermaid code comments
    // Format: %% nodeId: {"title": "...", "description": "...", "details": [...], "subDiagram": "..."}
    function parseDiagramMetadata(mermaidCode) {
        var lines = mermaidCode.split('\n');
        var metadata = {};
        lines.forEach(function(line) {
            var match = line.match(/%%\s*(\w+):\s*(\{.*\})/);
            if (match) {
                try {
                    metadata[match[1]] = JSON.parse(match[2]);
                } catch (e) {
                    console.warn('Invalid diagram metadata:', match[1]);
                }
            }
        });
        return metadata;
    }

    // Setup interactive features on rendered diagrams
    function setupInteractiveDiagrams() {
        var diagrams = document.querySelectorAll('pre.mermaid[data-processed="true"] svg');
        diagrams.forEach(function(svg) {
            // Find all clickable nodes (those with IDs that might have data)
            var nodes = svg.querySelectorAll('.node, .cluster');
            nodes.forEach(function(node) {
                var nodeId = node.id || '';
                // Extract clean node ID from mermaid's generated ID format
                var cleanId = nodeId.replace(/^flowchart-/, '').replace(/-\d+$/, '');

                // Make nodes visually interactive
                node.classList.add('clickable');
                node.style.cursor = 'pointer';

                // Click handler for popup
                node.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showDiagramPopup(cleanId, node);
                });

                // Hover handler for tooltip
                node.addEventListener('mouseenter', function(e) {
                    showDiagramTooltip(cleanId, node, e);
                });

                node.addEventListener('mouseleave', function() {
                    hideDiagramTooltip();
                });
            });
        });
    }

    // Show popup with node details
    function showDiagramPopup(nodeId, nodeElement) {
        var modal = document.getElementById('diagramPopupModal');
        var title = document.getElementById('diagramPopupTitle');
        var body = document.getElementById('diagramPopupBody');

        if (!modal || !title || !body) return;

        // Get node data if available
        var data = diagramNodeData[nodeId];
        var nodeText = getNodeText(nodeElement);

        title.textContent = data && data.title ? data.title : nodeText || nodeId;

        var html = '';
        if (data) {
            if (data.description) {
                html += '<div class="node-description">' + data.description + '</div>';
            }
            if (data.details && data.details.length > 0) {
                html += '<div class="node-details"><h4>Details</h4><ul>';
                data.details.forEach(function(detail) {
                    html += '<li>' + detail + '</li>';
                });
                html += '</ul></div>';
            }
            if (data.subDiagram) {
                html += '<div class="sub-diagram"><h4>Component Diagram</h4>';
                html += '<pre class="mermaid" data-processed="false">' + data.subDiagram + '</pre></div>';
                // Render the sub-diagram after a short delay
                setTimeout(function() {
                    renderMermaidDiagrams();
                }, 50);
            }
            if (data.links && data.links.length > 0) {
                html += '<div class="node-details"><h4>Related</h4><ul>';
                data.links.forEach(function(link) {
                    html += '<li><a href="' + link.url + '" style="color:var(--cyan);">' + link.label + '</a></li>';
                });
                html += '</ul></div>';
            }
        } else {
            // Default content when no metadata is available
            html = '<div class="node-description">Click on diagram nodes to see detailed information.</div>';
            html += '<div class="node-details"><h4>Node: ' + (nodeText || nodeId) + '</h4>';
            html += '<p style="color:var(--text-secondary);">To add interactive content, include metadata in the mermaid code:</p>';
            html += '<pre style="background:rgba(0,0,0,0.3);padding:10px;border-radius:4px;font-size:11px;overflow-x:auto;">';
            html += '%% ' + nodeId + ': {"title": "Title", "description": "...", "details": ["item1", "item2"]}</pre>';
            html += '</div>';
        }

        body.innerHTML = html;
        modal.style.display = 'flex';

        // Close on backdrop click
        modal.onclick = function(e) {
            if (e.target === modal) closeDiagramPopup();
        };

        // Close on Escape
        document.addEventListener('keydown', handleDiagramPopupEscape);
    }
    window.showDiagramPopup = showDiagramPopup;

    function closeDiagramPopup() {
        var modal = document.getElementById('diagramPopupModal');
        if (modal) modal.style.display = 'none';
        document.removeEventListener('keydown', handleDiagramPopupEscape);
    }
    window.closeDiagramPopup = closeDiagramPopup;

    function handleDiagramPopupEscape(e) {
        if (e.key === 'Escape') closeDiagramPopup();
    }

    // Show tooltip on hover
    function showDiagramTooltip(nodeId, nodeElement, event) {
        hideDiagramTooltip();

        var data = diagramNodeData[nodeId];
        var nodeText = getNodeText(nodeElement);
        var tooltipText = data && data.tooltip ? data.tooltip : (nodeText ? 'Click for details: ' + nodeText : 'Click for details');

        var tooltip = document.createElement('div');
        tooltip.className = 'diagram-tooltip';
        tooltip.textContent = tooltipText;

        document.body.appendChild(tooltip);
        currentDiagramTooltip = tooltip;

        // Position tooltip above the node
        var rect = nodeElement.getBoundingClientRect();
        tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 10 + window.scrollY) + 'px';
    }

    function hideDiagramTooltip() {
        if (currentDiagramTooltip) {
            currentDiagramTooltip.remove();
            currentDiagramTooltip = null;
        }
    }

    // Helper to extract text from a node element
    function getNodeText(nodeElement) {
        var textEl = nodeElement.querySelector('text, .nodeLabel');
        return textEl ? textEl.textContent.trim() : '';
    }

    // Register node data from Claude's response (can be called from markdown)
    function registerDiagramData(nodeId, data) {
        diagramNodeData[nodeId] = data;
    }
    window.registerDiagramData = registerDiagramData;

    // Clear all diagram data (call when clearing response)
    function clearDiagramData() {
        diagramNodeData = {};
    }
    window.clearDiagramData = clearDiagramData;

    // Open Mermaid diagram in fullscreen modal
    function openMermaidFullscreen(container) {
        var svg = container.querySelector('svg');
        if (!svg) return;

        // Get the SVG's actual rendered size
        var svgRect = svg.getBoundingClientRect();
        var originalWidth = svgRect.width || svg.getAttribute('width') || 400;
        var originalHeight = svgRect.height || svg.getAttribute('height') || 300;

        // Create modal
        var modal = document.createElement('div');
        modal.className = 'mermaid-fullscreen-modal';
        modal.innerHTML = '<div class="mermaid-fullscreen-content">' +
            '<button class="mermaid-close-btn" onclick="closeMermaidFullscreen()">&times;</button>' +
            '<div class="mermaid-fullscreen-diagram"></div>' +
            '</div>';

        // Clone the SVG into the modal
        var diagramContainer = modal.querySelector('.mermaid-fullscreen-diagram');
        var svgClone = svg.cloneNode(true);

        // Calculate scale to fit viewport while maintaining aspect ratio
        var maxWidth = window.innerWidth * 0.9;
        var maxHeight = window.innerHeight * 0.85;
        var scale = Math.min(maxWidth / originalWidth, maxHeight / originalHeight, 2.5);

        // Apply scaled dimensions
        var newWidth = originalWidth * scale;
        var newHeight = originalHeight * scale;

        svgClone.setAttribute('width', newWidth);
        svgClone.setAttribute('height', newHeight);
        svgClone.style.width = newWidth + 'px';
        svgClone.style.height = newHeight + 'px';
        svgClone.style.maxWidth = 'none';
        svgClone.style.maxHeight = 'none';

        diagramContainer.appendChild(svgClone);
        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeMermaidFullscreen();
        });

        // Close on Escape key
        document.addEventListener('keydown', handleMermaidEscape);
    }
    window.openMermaidFullscreen = openMermaidFullscreen;

    function handleMermaidEscape(e) {
        if (e.key === 'Escape') closeMermaidFullscreen();
    }

    function closeMermaidFullscreen() {
        var modal = document.querySelector('.mermaid-fullscreen-modal');
        if (modal) modal.remove();
        document.removeEventListener('keydown', handleMermaidEscape);
    }
    window.closeMermaidFullscreen = closeMermaidFullscreen;

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

    // ========== IMAGE GENERATION DISPLAY ==========
    // Display generated images in the chat with clickable dashboard link
    function displayGeneratedImage(imageData) {
        // imageData: { url, preview_url, dashboard_url, prompt, revised_prompt, provider, model, size, quality }
        var imageUrl = imageData.preview_url || imageData.local_url || imageData.url;
        var dashboardUrl = imageData.dashboard_url || '';
        var prompt = imageData.prompt || 'Generated image';
        var shortPrompt = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt;

        var html = '<div class="generated-image-container" style="' +
            'background: linear-gradient(135deg, rgba(0,20,40,0.8), rgba(20,0,40,0.8));' +
            'border: 1px solid var(--accent);' +
            'border-radius: 12px;' +
            'padding: 20px;' +
            'margin: 16px 0;' +
            'text-align: center;">' +
            '<div style="margin-bottom: 12px; color: var(--accent); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 2px;">Image Generated</div>';

        if (dashboardUrl) {
            html += '<a href="' + dashboardUrl + '" target="_blank" title="View full dashboard">';
        }

        html += '<img src="' + imageUrl + '" alt="' + escapeHtml(shortPrompt) + '" style="' +
            'max-width: 100%;' +
            'max-height: 500px;' +
            'border-radius: 8px;' +
            'box-shadow: 0 0 30px rgba(0,255,255,0.3), 0 0 60px rgba(255,0,255,0.2);' +
            'cursor: pointer;' +
            'transition: transform 0.2s, box-shadow 0.2s;" ' +
            'onclick="openLightbox(this.src)"' +
            'onmouseover="this.style.transform=\'scale(1.02)\';this.style.boxShadow=\'0 0 40px rgba(0,255,255,0.5), 0 0 80px rgba(255,0,255,0.3)\';" ' +
            'onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'0 0 30px rgba(0,255,255,0.3), 0 0 60px rgba(255,0,255,0.2)\';">';

        if (dashboardUrl) {
            html += '</a>';
        }

        html += '<div style="margin-top: 12px; font-size: 0.9rem; color: #888;">' +
            '<div style="margin-bottom: 8px;"><em>"' + escapeHtml(shortPrompt) + '"</em></div>' +
            '<div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">' +
            '<span style="background: rgba(0,255,255,0.1); padding: 4px 10px; border-radius: 4px;">' + (imageData.provider || 'OpenAI') + '</span>' +
            '<span style="background: rgba(0,255,255,0.1); padding: 4px 10px; border-radius: 4px;">' + (imageData.model || 'DALL-E 3') + '</span>' +
            '<span style="background: rgba(0,255,255,0.1); padding: 4px 10px; border-radius: 4px;">' + (imageData.size || '1024x1024') + '</span>' +
            '<span style="background: rgba(0,255,255,0.1); padding: 4px 10px; border-radius: 4px;">' + (imageData.quality || 'standard').toUpperCase() + '</span>' +
            '</div>';

        if (dashboardUrl) {
            html += '<a href="' + dashboardUrl + '" target="_blank" style="' +
                'display: inline-block;' +
                'margin-top: 12px;' +
                'padding: 8px 20px;' +
                'background: linear-gradient(135deg, rgba(0,255,255,0.2), rgba(255,0,255,0.2));' +
                'border: 1px solid var(--accent);' +
                'border-radius: 5px;' +
                'color: var(--accent);' +
                'text-decoration: none;' +
                'font-size: 0.85rem;' +
                'transition: all 0.2s;" ' +
                'onmouseover="this.style.background=\'linear-gradient(135deg, rgba(0,255,255,0.4), rgba(255,0,255,0.4))\'" ' +
                'onmouseout="this.style.background=\'linear-gradient(135deg, rgba(0,255,255,0.2), rgba(255,0,255,0.2))\'">View Full Dashboard</a>';
        }

        html += '</div></div>';

        return html;
    }
    window.displayGeneratedImage = displayGeneratedImage;

    // Append generated image to the response area
    function appendGeneratedImage(imageData) {
        var html = displayGeneratedImage(imageData);
        responseArea.innerHTML = responseArea.innerHTML + html;
        scrollToBottom();
    }
    window.appendGeneratedImage = appendGeneratedImage;

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

        // Put content FIRST, then agent context at the END (more readable)
        return cleanText + '\n\n---\n' + context.trim();
    }

    // ========== MESSAGE SENDING ==========
    async function sendMessage() {
        var text = inputArea.value.trim();
        if (!text && attachedImages.length === 0 && attachedFiles.length === 0 && attachedVideos.length === 0 && attachedPdfs.length === 0) {
            showToast('Enter a message or attach a file', 'error');
            return;
        }

        var project = document.getElementById('projectSelect').value;

        // Apply agent mode context to message (auto-detected from content)
        var processedText = textWasFormatted ? text : prepareMessageWithAgentContext(text);
        textWasFormatted = false;  // Reset flag after use

        // Auto-append /orchestrate command at end for multi-agent task decomposition
        // Skip if message already has a slash command
        if (!processedText.trim().startsWith('/')) {
            // Put /orchestrate at the END so content comes first
            processedText = processedText + '\n\n/orchestrate';
        }

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

        var imagesToSend = attachedImages.slice();
        var filesToSend = attachedFiles.slice();
        var videosToSend = attachedVideos.slice();
        var pdfsToSend = attachedPdfs.slice();

        inputArea.value = '';
        attachedImages = [];
        attachedFiles = [];
        attachedVideos = [];
        attachedPdfs = [];
        renderAttachments();
        renderVideos();
        renderPdfs();

        // Use processed text with agent context
        text = processedText;

        // Detect and show active skills
        if (typeof onMessageSent === 'function') {
            onMessageSent(text);
        }

        // If a job is already running, add to queue instead
        if (currentJobId) {
            addToQueue(text, imagesToSend, filesToSend, project, videosToSend, pdfsToSend);
            return;
        }

        startStreaming(); // New content at top, scroll there

        await sendMessageDirect(processedText, imagesToSend, filesToSend, project, videosToSend, pdfsToSend);
    }
    window.sendMessage = sendMessage;

    async function sendMessageDirect(text, images, files, project, videos, pdfs) {
        // Use selected model from dropdown (defaults to 'claude' which uses local CLI)
        var model = getSelectedModel() || 'claude';
        pendingUserMessage = text;
        statusEl.textContent = 'Sending...';

        showAckBanner('Sending message to server...', false);

        // Show loading state in the LIVE BOX
        // Render user message with markdown so Smart Send formatting shows properly
        startStreaming();
        var userMessageHtml = renderMarkdown(text);
        var loadingHtml = '<div class="message-user" style="color:#00f0ff;"><strong>You:</strong><br>' + userMessageHtml + '</div>' +
            '<div class="message-assistant" style="color:#ffffff;"><strong>Axion:</strong> <div style="color:rgba(255,255,255,0.7);">Sending to Claude...</div></div>';
        updateLiveBox(loadingHtml, 'Sending...');

        // Only render existing history if screen wasn't cleared
        if (!screenCleared) {
            renderChatHistory();
        }
        renderQueuePanel();

        try {
            // Combine all media into images array (Claude accepts videos and PDFs as image content)
            var allMedia = (images || []).slice();

            // Add videos - use file path if uploaded, otherwise use base64
            var videoPaths = [];
            if (videos && videos.length > 0) {
                videos.forEach(function(v) {
                    if (v.path) {
                        // Video was uploaded to server - pass path for FFmpeg processing
                        videoPaths.push({ path: v.path, name: v.name, type: v.type });
                    } else if (v.data) {
                        // Fallback to base64 (may not work for large files)
                        allMedia.push({ data: v.data, type: v.type, name: v.name });
                    }
                });
            }

            // Add PDFs to media (Claude can process PDFs)
            if (pdfs && pdfs.length > 0) {
                pdfs.forEach(function(p) {
                    allMedia.push({ data: p.data, type: p.type, name: p.name });
                });
            }

            var payload = {
                message: text,
                model: model,
                project: project,
                images: allMedia,
                videos: videoPaths,  // Separate video paths for FFmpeg processing
                files: files || [],
                personality: currentPersonality || 'neutral',
                customPrompt: getActivePersonalityPrompt(currentPersonality || 'neutral')
            };
            console.log('Sending chat with personality:', currentPersonality, 'customPrompt:', payload.customPrompt ? payload.customPrompt.substring(0, 50) + '...' : 'none');
            var res = await fetch('/api/chat/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var data = await res.json();

            if (data.job_id) {
                saveJobState(data.job_id, project, text);
                updateQuickMsgButton(); // Show the quick message button now that job is active
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

    function stopPolling() {
        if (pollInterval) {
            if (typeof pollInterval.close === 'function') {
                pollInterval.close(); // SSE EventSource
            } else {
                clearInterval(pollInterval); // Legacy setInterval polling
            }
            pollInterval = null;
        }
    }

    function startPolling(jobId, project) {
        stopPolling(); // Clean up any existing connection
        // Try SSE first for real-time updates, fall back to polling
        if (typeof EventSource !== 'undefined') {
            try {
                startSSEPolling(jobId, project);
                return;
            } catch (e) {
                console.warn('SSE failed, falling back to polling:', e);
            }
        }
        startLegacyPolling(jobId, project);
    }

    function startSSEPolling(jobId, project) {
        var startTime = Date.now();
        var dots = 0;
        var eventSource = new EventSource('/api/sse/status/' + jobId);
        pollInterval = { close: function() { eventSource.close(); } };

        eventSource.onmessage = function(event) {
            dots = (dots + 1) % 4;
            var elapsed = Math.floor((Date.now() - startTime) / 1000);
            try {
                var data = JSON.parse(event.data);

                if (data.status === 'complete' || data.status === 'error') {
                    // Close SSE and use one final polling fetch for completion
                    // (to get screenshots, cleanup, etc. via existing tested code)
                    eventSource.close();
                    startLegacyPolling(jobId, project);
                    return;
                }

                if (data.status === 'waiting_for_answers') {
                    statusEl.textContent = 'Claude needs your input...';
                    var modal = document.getElementById('questionsModal');
                    var questionHash = data.question_hash || JSON.stringify(data.questions || []);
                    if (!modal.classList.contains('visible') && questionHash !== lastShownQuestionHash) {
                        lastShownQuestionHash = questionHash;
                        showAckBanner('Claude has questions for you!', true);
                        showQuestionsModal(data.questions || [], data.response_so_far || '');
                    }
                } else if (data.status === 'pending') {
                    // Job is queued but not started yet - show waiting status with user message preserved
                    statusEl.textContent = 'Waiting for Claude... (' + elapsed + 's)';
                    showAckBanner('Message queued - waiting for Claude...', true);
                    var waitHtml = '<div class="message-user" style="margin-bottom:8px;color:#00f0ff;"><strong>You:</strong><br>' + renderMarkdown(pendingUserMessage) + '</div>' +
                        '<div class="live-chunk"><span class="thinking">Waiting for Claude' + '.'.repeat(dots) + '</span></div>';
                    updateLiveBox(waitHtml, 'Waiting... (' + elapsed + 's)');
                } else if (data.status === 'processing') {
                    var activityText = data.activity || ('Thinking' + '.'.repeat(dots));
                    statusEl.textContent = activityText + ' (' + elapsed + 's)';
                    showAckBanner(activityText + ' (' + elapsed + 's)', true);

                    if (data.stream && data.stream.length > 0) {
                        // Show Claude's response stream with user message preserved
                        var streamText = parseStreamJson(data.stream);
                        updateLiveBoxWithChunk(streamText, pendingUserMessage, activityText + ' (' + elapsed + 's)');
                        addCopyButtons();
                        renderMermaidDiagrams();
                    } else {
                        // Still waiting for content - show user message + thinking indicator
                        var thinkHtml = '<div class="message-user" style="margin-bottom:8px;color:#00f0ff;"><strong>You:</strong><br>' + renderMarkdown(pendingUserMessage) + '</div>' +
                            '<div class="live-chunk"><span class="thinking">' + activityText + '</span></div>';
                        updateLiveBox(thinkHtml, activityText + ' (' + elapsed + 's)');
                    }
                }
            } catch (e) {
                console.warn('SSE parse error:', e);
            }
        };

        eventSource.onerror = function() {
            eventSource.close();
            console.warn('SSE connection lost, falling back to polling');
            startLegacyPolling(jobId, project);
        };
    }

    function startLegacyPolling(jobId, project) {
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
                    // Only show modal if not already visible and questions are new
                    var modal = document.getElementById('questionsModal');
                    var questionHash = data.question_hash || JSON.stringify(data.questions || []);
                    if (!modal.classList.contains('visible') && questionHash !== lastShownQuestionHash) {
                        lastShownQuestionHash = questionHash;
                        showAckBanner('Claude has questions for you!', true);
                        showQuestionsModal(data.questions || [], data.response_so_far || '');
                    }
                } else if (data.status === 'complete') {
                    stopPolling();
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

                    // Mark live box as complete then hide after longer delay
                    // so user can see the completion summary
                    // Use tracked timer so it can be cancelled if new job starts
                    completeLiveBox();

                    // Show a brief completion summary in the live box
                    var completionSummary = extractCompletionSummary(data.result);
                    if (completionSummary) {
                        updateLiveBox('<div class="live-completion-summary">' + completionSummary + '</div>', 'Complete ✓');
                    }

                    hideLiveBoxTimer = setTimeout(function() {
                        hideLiveBox();
                        renderChatHistory();
                        hideLiveBoxTimer = null;
                    }, 5000); // Extended to 5 seconds so user can read summary

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
                    stopPolling();
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

                    // Announce major activity changes via voice
                    if (window.autoReadEnabled && activityText !== window.lastSpokenActivity) {
                        // Only announce significant activities (agents, searches, etc.)
                        if (activityText.indexOf('Agent') !== -1 ||
                            activityText.indexOf('agent') !== -1 ||
                            activityText.indexOf('Explorer') !== -1 ||
                            activityText.indexOf('Research') !== -1 ||
                            activityText.indexOf('Planning') !== -1 ||
                            activityText.indexOf('Web search') !== -1 ||
                            activityText.indexOf('Complete') !== -1) {
                            window.lastSpokenActivity = activityText;
                            speakActivityUpdate(activityText);
                        }
                    }

                    if (data.stream && data.stream.length > 0) {
                        var streamText = parseStreamJson(data.stream);

                        // Show Claude's response with user message preserved
                        updateLiveBoxWithChunk(streamText, pendingUserMessage, activityText + ' (' + elapsed + 's)');
                        addCopyButtons();
                        renderMermaidDiagrams();
                        // Auto-read is handled inside updateLiveBoxWithChunk
                    } else {
                        // Still waiting for content - show user message + thinking indicator
                        var thinkHtml2 = '<div class="message-user" style="margin-bottom:8px;color:#00f0ff;"><strong>You:</strong><br>' + renderMarkdown(pendingUserMessage) + '</div>' +
                            '<div class="live-chunk"><span class="thinking">' + activityText + '</span></div>';
                        updateLiveBox(thinkHtml2, activityText + ' (' + elapsed + 's)');
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
                            // Generate tool descriptions for activity/status only
                            // These are NOT added to textParts (response text) -
                            // they're used for status bar and voice announcements
                            var toolDesc = '';
                            if (tool === 'Read' && input.file_path) {
                                var filename = input.file_path.split('/').pop();
                                toolDesc = '📖 Reading file: ' + filename;
                            } else if (tool === 'Edit' && input.file_path) {
                                var filename = input.file_path.split('/').pop();
                                toolDesc = '✏️ Editing file: ' + filename;
                            } else if (tool === 'Write' && input.file_path) {
                                var filename = input.file_path.split('/').pop();
                                toolDesc = '📝 Creating file: ' + filename;
                            } else if (tool === 'Bash') {
                                var cmd = input.command || '';
                                var desc = input.description || '';
                                if (desc) {
                                    toolDesc = '💻 ' + desc;
                                } else if (cmd.startsWith('git ')) {
                                    toolDesc = '💻 Running git ' + (cmd.split(' ')[1] || 'command');
                                } else if (cmd.startsWith('npm ') || cmd.startsWith('yarn ')) {
                                    toolDesc = '💻 Running ' + cmd.substring(0, 40);
                                } else {
                                    toolDesc = '💻 Executing: ' + cmd.substring(0, 50) + (cmd.length > 50 ? '...' : '');
                                }
                            } else if (tool === 'Grep' && input.pattern) {
                                var searchPath = input.path ? ' in ' + input.path.split('/').pop() : ' in codebase';
                                toolDesc = '🔍 Searching for "' + input.pattern + '"' + searchPath;
                            } else if (tool === 'Glob' && input.pattern) {
                                toolDesc = '📂 Finding files matching: ' + input.pattern;
                            } else if (tool === 'Task') {
                                var desc = input.description || '';
                                var prompt = input.prompt || '';
                                var agentType = input.subagent_type || 'general';
                                var toolId = (content[j].id || '').substring(0, 8);

                                // Natural language agent type names
                                var agentTypeName = 'Agent';
                                if (agentType === 'Explore') agentTypeName = 'Explorer';
                                else if (agentType === 'Plan') agentTypeName = 'Planner';
                                else if (agentType === 'general-purpose') agentTypeName = 'Research Agent';
                                else if (agentType === 'Bash') agentTypeName = 'Command Agent';

                                // Build detailed description
                                if (desc) {
                                    toolDesc = '🤖 ' + agentTypeName + ' (' + toolId + '): ' + desc;
                                } else if (prompt) {
                                    var firstLine = prompt.split('\n')[0].substring(0, 60);
                                    toolDesc = '🤖 ' + agentTypeName + ' (' + toolId + '): ' + firstLine;
                                } else {
                                    toolDesc = '🤖 Starting ' + agentTypeName + ' (' + toolId + ')';
                                }

                                // Speak agent launch for significant agents
                                if (window.autoReadEnabled && !window.agentAnnouncedIds) {
                                    window.agentAnnouncedIds = {};
                                }
                                if (window.autoReadEnabled && toolId && !window.agentAnnouncedIds[toolId]) {
                                    window.agentAnnouncedIds[toolId] = true;
                                    var voiceMsg = agentTypeName + ' starting: ' + (desc || 'working on task');
                                    speakActivityUpdate(voiceMsg);
                                }
                            } else if (tool === 'TodoWrite') {
                                toolDesc = '📋 Updating task checklist';
                            } else if (tool === 'WebFetch') {
                                var url = input.url || '';
                                var domain = url ? url.split('//')[1]?.split('/')[0] || 'web page' : 'web page';
                                toolDesc = '🌐 Fetching content from ' + domain;
                            } else if (tool === 'WebSearch') {
                                toolDesc = '🔎 Searching the web for: ' + (input.query || '');
                            } else if (tool === 'AskUserQuestion') {
                                toolDesc = '❓ Waiting for your response';
                            } else {
                                toolDesc = '🔧 Using ' + tool;
                            }
                            // Update live activity status with tool description (not added to response text)
                            if (toolDesc && window.speakActivityUpdate && window.autoReadEnabled) {
                                speakActivityUpdate(toolDesc);
                            }
                        } else if (content[j].type === 'tool_result') {
                            // Tool results are internal - not shown in response text
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

    // Extract a brief summary from the completion result
    function extractCompletionSummary(result) {
        if (!result) return '';

        // Try to find key summary indicators
        var text = result.toString();

        // Look for common summary patterns
        var patterns = [
            /\*\*(?:Summary|Done|Complete|Completed|Finished)[:\*]*\s*([^\n]+)/i,
            /(?:✓|✅|Done|Complete)[:\s]*([^\n]+)/i,
            /^##?\s*(?:Summary|Results?|Output)[:\s]*\n([^\n]+)/im
        ];

        for (var i = 0; i < patterns.length; i++) {
            var match = text.match(patterns[i]);
            if (match && match[1]) {
                return match[1].substring(0, 200);
            }
        }

        // Fallback: get first meaningful line (skip code blocks, blank lines)
        var lines = text.split('\n').filter(function(line) {
            line = line.trim();
            return line.length > 10 &&
                   !line.startsWith('```') &&
                   !line.startsWith('#') &&
                   !line.startsWith('|') &&
                   !line.startsWith('-') &&
                   !line.startsWith('*');
        });

        if (lines.length > 0) {
            var summary = lines[0].substring(0, 200);
            if (lines[0].length > 200) summary += '...';
            return summary;
        }

        return 'Task completed successfully';
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
                    renderMermaidDiagrams();
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

    function addToQueue(message, images, files, project, videos, pdfs) {
        messageQueue.push({
            message: message,
            images: images || [],
            files: files || [],
            videos: videos || [],
            pdfs: pdfs || [],
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

        await sendMessageDirect(item.message, item.images, item.files, item.project, item.videos, item.pdfs);

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
        updateQuickMsgButton();

        // Clear active skills indicator
        if (typeof clearActiveSkills === 'function') {
            clearActiveSkills();
        }

        // Close quick message bar if open
        var bar = document.getElementById('quickMsgBar');
        if (bar && quickMsgOpen) {
            quickMsgOpen = false;
            bar.style.display = 'none';
        }

        // Note: Voice recording resume is handled by the speak() function's onend callback
        // after the "Task completed" announcement finishes playing

        setTimeout(processQueue, 500);

        // Return task title for completion announcements
        return taskTitle;
    }

    // ========== QUICK MESSAGE (SEND WHILE PROCESSING) ==========
    var quickMsgOpen = false;

    function toggleQuickMessage() {
        var bar = document.getElementById('quickMsgBar');
        var input = document.getElementById('quickMsgInput');
        if (!bar) return;

        quickMsgOpen = !quickMsgOpen;
        bar.style.display = quickMsgOpen ? 'block' : 'none';

        if (quickMsgOpen && input) {
            input.value = '';
            input.focus();
        }
    }
    window.toggleQuickMessage = toggleQuickMessage;

    function sendQuickMessage() {
        var input = document.getElementById('quickMsgInput');
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;

        var project = document.getElementById('projectSelect').value;

        // Use the existing queue/send system
        if (currentJobId) {
            // Job running - queue it
            addToQueue(text, [], [], project, [], []);
        } else {
            // No job running - send directly
            startStreaming();
            sendMessageDirect(text, [], [], project, [], []);
        }

        // Clear and close
        input.value = '';
        toggleQuickMessage();
    }
    window.sendQuickMessage = sendQuickMessage;

    function updateQuickMsgButton() {
        var btn = document.getElementById('quickMsgBtn');
        if (!btn) return;
        if (currentJobId) {
            btn.style.display = '';
            btn.classList.add('active-pulse');
        } else {
            btn.style.display = 'none';
            btn.classList.remove('active-pulse');
        }
    }

    // Setup keyboard handler for quick message input
    document.addEventListener('keydown', function(e) {
        var input = document.getElementById('quickMsgInput');
        if (!input || document.activeElement !== input) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendQuickMessage();
        }
        if (e.key === 'Escape') {
            toggleQuickMessage();
        }
    });

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

    // Video file support for analysis
    var attachedVideos = [];

    function isVideoFile(file) {
        var videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
        var videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'];
        if (videoTypes.some(function(t) { return file.type === t || file.type.startsWith('video/'); })) return true;
        var name = file.name.toLowerCase();
        return videoExtensions.some(function(ext) { return name.endsWith(ext); });
    }

    function addVideo(file) {
        // Upload video to server immediately to avoid base64 size issues
        var formData = new FormData();
        formData.append('video', file);
        formData.append('filename', file.name);

        showToast('Uploading video...', 'success');

        fetch('/api/upload/video', {
            method: 'POST',
            body: formData
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.path) {
                attachedVideos.push({
                    path: data.path,
                    type: file.type,
                    name: file.name,
                    size: file.size,
                    url: data.url
                });
                renderVideos();
                showToast('Video uploaded: ' + file.name, 'success');
            } else {
                showToast('Failed to upload video: ' + (data.error || 'Unknown error'), 'error');
            }
        })
        .catch(function(err) {
            showToast('Failed to upload video: ' + err.message, 'error');
        });
    }

    function renderVideos() {
        // Get or create video container
        var videoContainer = document.getElementById('videoContainer');
        if (!videoContainer) {
            videoContainer = document.createElement('div');
            videoContainer.id = 'videoContainer';
            videoContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:rgba(0,20,40,0.5);border:1px solid var(--accent);border-radius:8px;margin-bottom:8px;';
            imageContainer.parentNode.insertBefore(videoContainer, imageContainer.nextSibling);
        }

        if (attachedVideos.length === 0) {
            videoContainer.style.display = 'none';
            return;
        }

        videoContainer.style.display = 'flex';
        videoContainer.innerHTML = '<div style="width:100%;color:var(--accent);font-size:0.8rem;margin-bottom:4px;">Attached Videos:</div>';

        attachedVideos.forEach(function(vid, idx) {
            var div = document.createElement('div');
            div.style.cssText = 'position:relative;background:rgba(0,40,60,0.6);border:1px solid var(--border);border-radius:6px;padding:10px;display:flex;align-items:center;gap:8px;';
            var sizeStr = (vid.size / (1024 * 1024)).toFixed(2) + ' MB';
            div.innerHTML = '<span style="font-size:1.5rem;">🎬</span>' +
                '<div style="font-size:0.85rem;">' +
                '<div style="color:var(--text);">' + escapeHtml(vid.name) + '</div>' +
                '<div style="color:#888;font-size:0.75rem;">' + sizeStr + '</div>' +
                '</div>' +
                '<button class="remove-btn" onclick="removeVideo(' + idx + ')" style="position:absolute;top:2px;right:2px;background:#ff4444;border:none;color:white;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;">&times;</button>';
            videoContainer.appendChild(div);
        });
    }

    function removeVideo(idx) {
        attachedVideos.splice(idx, 1);
        renderVideos();
    }
    window.removeVideo = removeVideo;

    // YouTube video download and analysis
    function openYouTubeModal() {
        document.getElementById('youtubeModal').style.display = 'flex';
        document.getElementById('youtubeUrl').value = '';
        document.getElementById('ytProgress').style.display = 'none';
        document.getElementById('ytDownloadBtn').disabled = false;
        document.getElementById('youtubeUrl').focus();
    }
    window.openYouTubeModal = openYouTubeModal;

    function closeYouTubeModal() {
        document.getElementById('youtubeModal').style.display = 'none';
    }
    window.closeYouTubeModal = closeYouTubeModal;

    function downloadYouTube() {
        var url = document.getElementById('youtubeUrl').value.trim();
        if (!url) {
            showToast('Please enter a YouTube URL', 'error');
            return;
        }

        // Validate URL format
        if (!url.match(/youtube\.com|youtu\.be/)) {
            showToast('Invalid YouTube URL', 'error');
            return;
        }

        var analyze = document.getElementById('ytAnalyze').checked;
        var transcribe = document.getElementById('ytTranscribe').checked;
        var frames = parseInt(document.getElementById('ytFrames').value);
        var whisperModel = document.getElementById('ytWhisperModel').value;

        // Show progress
        var progressDiv = document.getElementById('ytProgress');
        var progressBar = document.getElementById('ytProgressBar');
        var progressText = document.getElementById('ytProgressText');
        var downloadBtn = document.getElementById('ytDownloadBtn');

        progressDiv.style.display = 'block';
        downloadBtn.disabled = true;
        progressBar.style.width = '10%';
        progressText.textContent = 'Starting download...';

        // Simulate progress while waiting
        var progress = 10;
        var progressInterval = setInterval(function() {
            if (progress < 90) {
                progress += Math.random() * 5;
                progressBar.style.width = Math.min(progress, 90) + '%';
                if (progress < 30) progressText.textContent = 'Downloading video...';
                else if (progress < 60) progressText.textContent = 'Extracting frames...';
                else progressText.textContent = 'Transcribing audio...';
            }
        }, 500);

        fetch('/api/video/youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                analyze: analyze,
                transcribe: transcribe,
                frames: frames,
                whisper_model: whisperModel
            })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            clearInterval(progressInterval);

            if (data.error) {
                progressBar.style.width = '0%';
                progressBar.style.background = '#ff4444';
                progressText.textContent = 'Error: ' + data.error;
                downloadBtn.disabled = false;
                showToast('YouTube download failed: ' + data.error, 'error');
                return;
            }

            progressBar.style.width = '100%';
            progressText.textContent = 'Complete!';

            // Add to attached videos
            attachedVideos.push({
                path: data.video_path,
                type: 'video/mp4',
                name: data.title || 'YouTube Video',
                size: 0,
                url: data.video_path,
                youtube_url: url,
                transcript: data.transcript,
                frames: data.frames,
                duration: data.duration
            });
            renderVideos();

            // Build context message about the downloaded video
            var contextParts = ['Downloaded YouTube video: "' + (data.title || 'Video') + '"'];
            contextParts.push('Duration: ' + (data.duration || 0) + ' seconds');
            contextParts.push('Path: ' + data.video_path);

            if (data.transcript && data.transcript.text) {
                contextParts.push('\n--- TRANSCRIPT ---\n' + data.transcript.text);
            }

            if (data.frames && data.frames.length > 0) {
                contextParts.push('\n[' + data.frames.length + ' frames extracted and attached]');
            }

            // Add to input area as context
            var inputArea = document.getElementById('inputArea');
            if (inputArea.value) {
                inputArea.value += '\n\n';
            }
            inputArea.value += contextParts.join('\n');

            showToast('YouTube video downloaded: ' + (data.title || 'Video'), 'success');
            closeYouTubeModal();
        })
        .catch(function(err) {
            clearInterval(progressInterval);
            progressBar.style.width = '0%';
            progressBar.style.background = '#ff4444';
            progressText.textContent = 'Error: ' + err.message;
            downloadBtn.disabled = false;
            showToast('YouTube download failed: ' + err.message, 'error');
        });
    }
    window.downloadYouTube = downloadYouTube;

    // PDF file support for analysis
    var attachedPdfs = [];

    function isPdfFile(file) {
        return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    }

    function addPdf(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var base64 = e.target.result;
            attachedPdfs.push({ data: base64, type: file.type, name: file.name, size: file.size });
            renderPdfs();
            showToast('PDF attached: ' + file.name, 'success');
        };
        reader.readAsDataURL(file);
    }

    function renderPdfs() {
        // Get or create PDF container
        var pdfContainer = document.getElementById('pdfContainer');
        if (!pdfContainer) {
            pdfContainer = document.createElement('div');
            pdfContainer.id = 'pdfContainer';
            pdfContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:rgba(40,0,20,0.5);border:1px solid #ff6b9d;border-radius:8px;margin-bottom:8px;';
            var videoContainer = document.getElementById('videoContainer');
            if (videoContainer) {
                videoContainer.parentNode.insertBefore(pdfContainer, videoContainer.nextSibling);
            } else {
                imageContainer.parentNode.insertBefore(pdfContainer, imageContainer.nextSibling);
            }
        }

        if (attachedPdfs.length === 0) {
            pdfContainer.style.display = 'none';
            return;
        }

        pdfContainer.style.display = 'flex';
        pdfContainer.innerHTML = '<div style="width:100%;color:#ff6b9d;font-size:0.8rem;margin-bottom:4px;">Attached PDFs:</div>';

        attachedPdfs.forEach(function(pdf, idx) {
            var div = document.createElement('div');
            div.style.cssText = 'position:relative;background:rgba(60,0,30,0.6);border:1px solid var(--border);border-radius:6px;padding:10px;display:flex;align-items:center;gap:8px;';
            var sizeStr = (pdf.size / (1024 * 1024)).toFixed(2) + ' MB';
            div.innerHTML = '<span style="font-size:1.5rem;">📄</span>' +
                '<div style="font-size:0.85rem;">' +
                '<div style="color:var(--text);">' + escapeHtml(pdf.name) + '</div>' +
                '<div style="color:#888;font-size:0.75rem;">' + sizeStr + '</div>' +
                '</div>' +
                '<button class="remove-btn" onclick="removePdf(' + idx + ')" style="position:absolute;top:2px;right:2px;background:#ff4444;border:none;color:white;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;">&times;</button>';
            pdfContainer.appendChild(div);
        });
    }

    function removePdf(idx) {
        attachedPdfs.splice(idx, 1);
        renderPdfs();
    }
    window.removePdf = removePdf;

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
            } else if (isVideoFile(files[i])) {
                addVideo(files[i]);
            } else if (isPdfFile(files[i])) {
                addPdf(files[i]);
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

    // Track restart attempts for backoff on mobile
    var voiceRestartAttempts = 0;
    var voiceRestartTimer = null;
    var voiceIsStarting = false; // Prevent concurrent start() calls
    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    function safeStartRecognition() {
        if (!recognition || !isRecording) return;
        if (voiceIsStarting) return; // Prevent overlapping start attempts
        // Clear any pending restart
        if (voiceRestartTimer) { clearTimeout(voiceRestartTimer); voiceRestartTimer = null; }
        voiceIsStarting = true;
        try {
            recognition.start();
            voiceRestartAttempts = 0; // Reset on success
            voiceIsStarting = false;
        } catch(e) {
            voiceIsStarting = false;
            console.warn('Voice start failed:', e.message);
            voiceRestartAttempts++;
            // Longer backoff on mobile: 500ms base vs 300ms desktop
            var baseDelay = isMobile ? 500 : 300;
            var delay = Math.min(baseDelay * Math.pow(2, voiceRestartAttempts - 1), 5000);
            if (voiceRestartAttempts <= 5) {
                console.log('Retry voice start in ' + delay + 'ms (attempt ' + voiceRestartAttempts + ')');
                voiceRestartTimer = setTimeout(safeStartRecognition, delay);
            } else {
                console.error('Voice start failed after 5 retries, stopping');
                isRecording = false;
                localStorage.setItem('voiceEnabled', 'false');
                voiceBtn.classList.remove('recording');
                voiceBtn.textContent = '🎤';
                voiceDots.classList.remove('active');
                showToast('Microphone unavailable - check permissions', 'error');
            }
        }
    }

    // Helper to restore voice after speech output ends (used by all TTS engines)
    function restoreVoiceAfterSpeak() {
        var qaActive = typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive;
        if (qaActive) return;
        if (wasRecordingBeforeSpeak && recognition) {
            wasRecordingBeforeSpeak = false;
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
            voiceDots.classList.add('active');
            voiceRestartAttempts = 0;
            voiceIsStarting = false;
            var delay = isMobile ? 800 : 300;
            setTimeout(safeStartRecognition, delay);
        }
        if (wasRecordingBeforeTask && recognition) {
            wasRecordingBeforeTask = false;
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
            voiceDots.classList.add('active');
            voiceRestartAttempts = 0;
            voiceIsStarting = false;
            var delay2 = isMobile ? 800 : 300;
            setTimeout(safeStartRecognition, delay2);
        }
    }

    if (SR) {
        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = false; // Disable interim to avoid mobile duplication
        recognition.lang = 'en-US'; // Explicit language for consistent mobile behavior
        recognition.maxAlternatives = 1; // Reduce processing load on mobile
        recognition.onresult = function(e) {
            // Get only the latest final result
            var result = e.results[e.results.length - 1];
            if (!result.isFinal) return;

            var transcript = result[0].transcript;

            // Filter low-confidence results - lower threshold on mobile (0.3 vs 0.5)
            // Mobile browsers often return lower confidence for clear speech
            var confidence = result[0].confidence;
            var minConfidence = isMobile ? 0.3 : 0.5;
            if (confidence > 0 && confidence < minConfidence) {
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
        };
        recognition.onerror = function(e) {
            console.warn('Voice recognition error:', e.error);
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                // Mic permission denied - stop recording entirely
                isRecording = false;
                localStorage.setItem('voiceEnabled', 'false');
                voiceBtn.classList.remove('recording');
                voiceBtn.textContent = '🎤';
                voiceDots.classList.remove('active');
                showToast('Microphone permission denied - tap mic to retry', 'error');
            } else if (e.error === 'audio-capture') {
                // Mic not available (common on mobile when switching apps)
                // Stop cleanly first, then let onend handle restart with longer delay
                console.log('Audio capture error - will retry after longer delay');
                try { recognition.stop(); } catch(ex) {}
                voiceRestartAttempts++; // Count these toward backoff
            } else if (e.error === 'network') {
                showToast('Network error - voice may be limited', 'error');
                // Network errors may be transient, let onend retry
            } else if (e.error === 'aborted') {
                // Aborted can happen on mobile when OS kills the audio session
                console.log('Voice recognition aborted (possibly by OS)');
            }
            // 'no-speech' is normal - no toast needed
        };
        recognition.onend = function() {
            voiceIsStarting = false; // Reset starting flag
            if (isRecording) {
                // Mobile needs longer delay for audio device to fully release
                var restartDelay = isMobile ? 600 : 300;
                // If we've had recent errors, use backoff delay instead
                if (voiceRestartAttempts > 0) {
                    var baseDelay = isMobile ? 800 : 500;
                    restartDelay = Math.min(baseDelay * Math.pow(2, voiceRestartAttempts - 1), 5000);
                }
                voiceRestartTimer = setTimeout(safeStartRecognition, restartDelay);
            }
        };
    }

    // Handle mobile tab switching / screen lock - restart mic when returning
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // Page going to background - stop voice cleanly to release audio on mobile
            if (SR && recognition && isRecording) {
                console.log('Page hidden, stopping voice cleanly');
                if (voiceRestartTimer) { clearTimeout(voiceRestartTimer); voiceRestartTimer = null; }
                try { recognition.stop(); } catch(e) {}
            }
        } else {
            // Page visible again - refresh history and check for completed jobs
            var project = getSelectedProject();
            if (project) {
                // If we had an active job, check if it completed while we were away
                if (currentJobId) {
                    fetch('/api/chat/status', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({job_id: currentJobId})
                    })
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            if (data.status === 'complete') {
                                // Job completed while phone was off - show the result
                                stopStreaming();
                                stopPolling();
                                var result = data.result || '';
                                var cleanedText = cleanLiveText(result);
                                updateLiveBoxWithChunk(cleanedText, pendingUserMessage, 'Complete');
                                currentJobId = null;
                                // Reload history to get the watcher-saved entry
                                loadChatHistory(project, true);
                            }
                        })
                        .catch(function() {
                            // If status check fails, just reload history
                            loadChatHistory(project, true);
                        });
                } else {
                    // No active job - just reload history in case something completed
                    loadChatHistory(project, true);
                }
            }

            // Restart voice if was recording
            if (SR && recognition && isRecording) {
                console.log('Page visible, restarting voice recognition');
                if (voiceRestartTimer) { clearTimeout(voiceRestartTimer); voiceRestartTimer = null; }
                try { recognition.stop(); } catch(e) {}
                voiceRestartAttempts = 0;
                voiceIsStarting = false;
                var visDelay = isMobile ? 1500 : 500;
                voiceRestartTimer = setTimeout(safeStartRecognition, visDelay);
            }
        }
    });

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
            // Stop any existing instance first, then start cleanly
            if (voiceRestartTimer) { clearTimeout(voiceRestartTimer); voiceRestartTimer = null; }
            try { recognition.stop(); } catch(e) {}
            voiceRestartAttempts = 0;
            voiceIsStarting = false;
            // Mobile needs longer delay after stop() for audio device release
            var startDelay = isMobile ? 500 : 200;
            setTimeout(safeStartRecognition, startDelay);
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? 'Cmds' : 'Stop';
            voiceDots.classList.add('active');
        } else {
            // Clear any pending restart timers
            if (voiceRestartTimer) { clearTimeout(voiceRestartTimer); voiceRestartTimer = null; }
            voiceIsStarting = false;
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

    // Speak activity updates (brief, non-interrupting announcements)
    var lastActivitySpoken = '';
    var activitySpeakCooldown = false;
    function speakActivityUpdate(text) {
        // DISABLED when auto-read is on - the narrative text already describes what's happening
        // Activity announcements would compete with and override the actual response text
        // Only use activity updates when auto-read is OFF (for status-only mode)
        return;

        // Legacy code below (disabled):
        // Only speak if auto-read is enabled and we're not in cooldown
        if (!window.autoReadEnabled) return;
        if (activitySpeakCooldown) return;
        if (text === lastActivitySpoken) return;

        // Don't interrupt main speech
        if (isSpeakingText) return;

        lastActivitySpoken = text;
        activitySpeakCooldown = true;

        // Brief cooldown to prevent spam
        setTimeout(function() {
            activitySpeakCooldown = false;
        }, 5000); // 5 second cooldown between activity announcements

        // Use a quieter, faster announcement
        var cleanedText = text.replace(/[📖✏️📝💻🔍📂🤖📋🌐🔎❓🔧]/g, '').trim();

        // Route through the selected TTS engine (same as processSpeakQueue)
        if (voiceSettings.engine === 'edge-tts') {
            var edgeVoice = voiceSettings.axionEdgeVoice || 'en-US-GuyNeural';
            speakWithEdgeTts(cleanedText, edgeVoice, function() {});
        } else if (voiceSettings.engine === 'piper') {
            var piperVoice = voiceSettings.axionPiperVoice || voiceSettings.piperVoice || 'amy';
            speakWithPiper(cleanedText, piperVoice, function() {});
        } else if (voiceSettings.engine === 'elevenlabs' && voiceSettings.axionElevenVoice) {
            speakWithElevenLabs(cleanedText, voiceSettings.axionElevenVoice,
                voiceSettings.elevenStability || 0.5, voiceSettings.elevenSimilarity || 0.75, function() {});
        } else if (window.speechSynthesis) {
            // Browser speech as final fallback
            var utterance = new SpeechSynthesisUtterance(cleanedText);
            utterance.rate = 1.2;
            utterance.volume = 0.7;
            window.speechSynthesis.speak(utterance);
        }
    }

    // Expose for use in parseStreamJson
    window.speakActivityUpdate = speakActivityUpdate;

    // Browser speech fallback - used when TTS engines fail or as default
    function speakWithBrowser(cleanedText, panel) {
        if (!window.speechSynthesis) {
            console.error('Browser speech synthesis not available');
            isSpeakingText = false;
            restoreVoiceAfterSpeak();
            return;
        }
        var u = new SpeechSynthesisUtterance(cleanedText);
        var voiceName = panel === 'axion' ? voiceSettings.axion : voiceSettings.brett;
        if (voiceName) {
            var voices = window.speechSynthesis.getVoices();
            var voice = voices.find(function(v) { return v.name === voiceName; });
            if (voice) u.voice = voice;
        }
        if (panel === 'axion') {
            u.pitch = voiceSettings.axionPitch || 1.0;
            u.rate = voiceSettings.axionRate || 1.0;
        }
        u.onend = function() {
            isSpeakingText = false;
            restoreVoiceAfterSpeak();
        };
        u.onerror = function() {
            isSpeakingText = false;
            restoreVoiceAfterSpeak();
        };
        window.speechSynthesis.speak(u);
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

        // Store panel for fallback use
        var _panel = panel;

        // Route to Edge TTS if selected
        if (voiceSettings.engine === 'edge-tts') {
            var edgeVoice = panel === 'axion'
                ? (voiceSettings.axionEdgeVoice || 'en-US-GuyNeural')
                : (voiceSettings.brettEdgeVoice || 'en-US-JennyNeural');

            speakWithEdgeTts(cleanedText, edgeVoice, function() {
                restoreVoiceAfterSpeak();
            });
            return;
        }

        // Route to Piper TTS if selected (local neural TTS)
        if (voiceSettings.engine === 'piper') {
            var piperVoice = panel === 'axion'
                ? (voiceSettings.axionPiperVoice || voiceSettings.piperVoice || 'amy')
                : (voiceSettings.brettPiperVoice || voiceSettings.piperVoice || 'amy');

            speakWithPiper(cleanedText, piperVoice, function() {
                restoreVoiceAfterSpeak();
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
                    restoreVoiceAfterSpeak();
                });
                return;
            }
        }

        // Browser speech engine (default/fallback)
        speakWithBrowser(cleanedText, panel);
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
        // Cancel any Piper TTS playback
        if (piperAudioCurrent) {
            piperAudioCurrent.pause();
            piperAudioCurrent = null;
        }
        piperSessionId++;
    }

    function stopSpeaking() {
        cancelAllSpeech();
        isSpeakingText = false;

        // Reset read aloud button styling
        ['readInputBtn', 'readResponseBtn'].forEach(function(id) {
            var btn = document.getElementById(id);
            if (btn) { btn.style.background = ''; btn.style.borderColor = ''; }
        });

        // Don't restore main recognition if Q&A voice is active
        var qaActive = typeof qaState !== 'undefined' && qaState && qaState.isVoiceActive;
        if (qaActive) return;
        // Restore voice recording if it was on before speaking
        if (wasRecordingBeforeSpeak && recognition) {
            wasRecordingBeforeSpeak = false;
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
            voiceDots.classList.add('active');
            voiceRestartAttempts = 0;
            voiceIsStarting = false;
            var delay = isMobile ? 800 : 300;
            setTimeout(safeStartRecognition, delay);
            showToast('Stopped reading, voice resumed', 'success');
        } else {
            showToast('Stopped reading', 'success');
        }
    }
    window.stopSpeaking = stopSpeaking;

    function readResponse() {
        var readBtn = document.getElementById('readResponseBtn');
        // Toggle: if already speaking, stop
        if (isSpeakingText) {
            stopSpeaking();
            if (readBtn) {
                readBtn.style.background = '';
                readBtn.style.borderColor = '';
            }
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

        // Visual feedback - turn green
        if (readBtn) {
            readBtn.style.background = 'var(--success)';
            readBtn.style.borderColor = 'var(--success)';
        }

        speak(text, 'axion');

        // Monitor isSpeakingText to reset button when speech ends
        var checkSpeechDone = setInterval(function() {
            if (!isSpeakingText) {
                clearInterval(checkSpeechDone);
                if (readBtn) {
                    readBtn.style.background = '';
                    readBtn.style.borderColor = '';
                }
            }
        }, 500);

        showToast('Reading Axion response... say "stop read" to stop', 'success');
    }
    window.readResponse = readResponse;

    function readInput() {
        var readBtn = document.getElementById('readInputBtn');
        // Toggle: if already speaking, stop
        if (isSpeakingText) {
            stopSpeaking();
            return;
        }
        var text = inputArea.value;
        if (!text) { showToast('Nothing to read', 'error'); return; }

        // Visual feedback - turn green
        if (readBtn) {
            readBtn.style.background = 'var(--success)';
            readBtn.style.borderColor = 'var(--success)';
        }

        speak(text, 'brett');

        // Monitor isSpeakingText to reset button when speech ends
        var checkSpeechDone = setInterval(function() {
            if (!isSpeakingText) {
                clearInterval(checkSpeechDone);
                if (readBtn) {
                    readBtn.style.background = '';
                    readBtn.style.borderColor = '';
                }
            }
        }, 500);

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
    window.autoReadEnabled = autoReadEnabled; // Expose for parseStreamJson and speakActivityUpdate
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
        window.autoReadEnabled = autoReadEnabled; // Keep window reference in sync
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
                stopPolling();
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

        // OPTIMIZATION: Clear old queue to stay synced with latest text
        // When streaming, prioritize recent content over completing backlog
        // This prevents voice from lagging 10+ seconds behind displayed text
        if (speakQueue.length > 2) {
            // Keep only the currently speaking item + 1 queued item
            // This allows smooth transition but skips old backlog
            speakQueue.splice(2);
        }

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
            // OPTIMIZATION: Batch sentences into larger chunks for faster playback
            // Instead of queueing 10 individual sentences (causing lag), batch into 2-3 chunks
            var batch = [];
            var batchLength = 0;
            var maxBatchLength = 150; // ~150 chars per batch for responsive playback

            sentences.forEach(function(sentence) {
                var trimmed = sentence.trim();
                if (!trimmed || trimmed.length < 4) return;
                // Skip lines that look like code (lots of symbols, brackets, etc)
                var codeChars = (trimmed.match(/[{}\[\]()=<>;\/\\|&^%$#@!~`]/g) || []).length;
                if (codeChars > trimmed.length * 0.15 && trimmed.length > 10) return;

                // Add to batch
                batch.push(trimmed);
                batchLength += trimmed.length;

                // Flush batch when it reaches target size
                if (batchLength >= maxBatchLength) {
                    queueSpeech(batch.join(' '));
                    batch = [];
                    batchLength = 0;
                }
            });

            // Flush remaining batch
            if (batch.length > 0) {
                queueSpeech(batch.join(' '));
            }
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

        // OPTIMIZATION: If queue is getting backed up (5+ items), skip to latest
        // This keeps voice in sync with text during fast streaming
        if (speakQueue.length > 5) {
            console.log('Speech queue backed up (' + speakQueue.length + ' items), skipping to latest');
            // Keep only the last 2 items
            speakQueue = speakQueue.slice(-2);
        }

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

        // Route to Piper if selected (local neural TTS)
        if (voiceSettings.engine === 'piper') {
            var piperVoice = voiceSettings.axionPiperVoice || voiceSettings.piperVoice || 'amy';
            speakWithPiper(text, piperVoice, function() {
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

    // ========== THEME SYSTEM ==========
    var currentTheme = localStorage.getItem('relayTheme') || 'dark';

    function getEffectiveTheme() {
        if (currentTheme === 'system') {
            return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        return currentTheme;
    }

    function applyTheme(theme) {
        var effective = theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
            : theme;

        if (effective === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        // Update highlight.js theme
        var hljsLink = document.getElementById('hljs-theme');
        if (hljsLink) {
            hljsLink.href = effective === 'light'
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
        }
    }

    function setTheme(theme) {
        currentTheme = theme;
        localStorage.setItem('relayTheme', theme);
        applyTheme(theme);
        updateThemeButtons();
        showToast('Theme: ' + theme.charAt(0).toUpperCase() + theme.slice(1), 'success');
    }
    window.setTheme = setTheme;

    function updateThemeButtons() {
        var buttons = ['themeDark', 'themeLight', 'themeSystem'];
        buttons.forEach(function(id) {
            var btn = document.getElementById(id);
            if (btn) btn.classList.remove('primary');
        });
        var activeId = 'theme' + currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
        var activeBtn = document.getElementById(activeId);
        if (activeBtn) activeBtn.classList.add('primary');
    }

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function() {
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });

    // Apply theme on load
    applyTheme(currentTheme);

    // ========== DISPLAY SETTINGS ==========
    function openDisplaySettings() {
        var modal = document.getElementById('displayModal');
        modal.style.display = 'block';
        // Set theme button state
        updateThemeButtons();
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
        applyAxionFontSize(size);
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
        // Piper TTS settings (AXION and BRETT voices)
        var axionPiperVoice = document.getElementById('axionPiperVoice');
        var brettPiperVoice = document.getElementById('brettPiperVoice');
        if (axionPiperVoice && axionPiperVoice.value) voiceSettings.axionPiperVoice = axionPiperVoice.value;
        if (brettPiperVoice && brettPiperVoice.value) voiceSettings.brettPiperVoice = brettPiperVoice.value;
        if (!voiceSettings.axionPiperVoice) voiceSettings.axionPiperVoice = 'amy';
        if (!voiceSettings.brettPiperVoice) voiceSettings.brettPiperVoice = 'amy';
        // Keep legacy piperVoice in sync (fallback for existing code)
        voiceSettings.piperVoice = voiceSettings.axionPiperVoice;
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
        // Save custom personality prompt for ElevenLabs
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
        // Shared personality (for Edge TTS, Piper, Browser TTS)
        var sharedPersonalitySelect = document.getElementById('sharedPersonality');
        if (sharedPersonalitySelect) voiceSettings.sharedPersonality = sharedPersonalitySelect.value || 'neutral';
        // Save custom personality prompt for shared engines
        var sharedPromptTextarea = document.getElementById('sharedCustomPrompt');
        if (sharedPromptTextarea && sharedPromptTextarea.value.trim()) {
            var sharedP = voiceSettings.sharedPersonality || 'neutral';
            var sharedDefaultPrompt = defaultPersonalityPrompts[sharedP] || '';
            if (sharedPromptTextarea.value.trim() !== sharedDefaultPrompt) {
                customPersonalityPrompts[sharedP] = sharedPromptTextarea.value.trim();
            } else {
                delete customPersonalityPrompts[sharedP];
            }
            localStorage.setItem('chatRelayCustomPrompts', JSON.stringify(customPersonalityPrompts));
        }
        localStorage.setItem('chatRelayVoices', JSON.stringify(voiceSettings));
        // Sync personality based on active engine
        if (voiceSettings.engine === 'elevenlabs' && voiceSettings.elevenPersonality) {
            selectPersonality(voiceSettings.elevenPersonality);
            console.log('saveVoiceSettings: synced ElevenLabs personality to:', voiceSettings.elevenPersonality);
        } else if (voiceSettings.sharedPersonality) {
            selectPersonality(voiceSettings.sharedPersonality);
            console.log('saveVoiceSettings: synced shared personality to:', voiceSettings.sharedPersonality);
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
        // Restore Piper voice selection (AXION and BRETT)
        var axionPiperSelect = document.getElementById('axionPiperVoice');
        var brettPiperSelect = document.getElementById('brettPiperVoice');
        if (axionPiperSelect) {
            axionPiperSelect.value = voiceSettings.axionPiperVoice || voiceSettings.piperVoice || 'amy';
        }
        if (brettPiperSelect) {
            brettPiperSelect.value = voiceSettings.brettPiperVoice || voiceSettings.piperVoice || 'amy';
        }
        // Restore shared personality settings
        var sharedPersonalitySelect = document.getElementById('sharedPersonality');
        var sharedCustomPrompt = document.getElementById('sharedCustomPrompt');
        if (sharedPersonalitySelect) {
            sharedPersonalitySelect.value = voiceSettings.sharedPersonality || 'neutral';
        }
        if (sharedCustomPrompt) {
            var sharedP = voiceSettings.sharedPersonality || 'neutral';
            sharedCustomPrompt.value = getActivePersonalityPrompt(sharedP);
        }
        // Show/hide shared personality section based on engine
        var sharedPersonalitySection = document.getElementById('sharedPersonalitySection');
        if (sharedPersonalitySection) {
            sharedPersonalitySection.style.display = voiceSettings.engine !== 'elevenlabs' ? 'block' : 'none';
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
        var piperBtn = document.getElementById('enginePiper');
        var elevenBtn = document.getElementById('engineElevenLabs');
        var browserSection = document.getElementById('browserVoiceSection');
        var edgeSection = document.getElementById('edgeTtsSection');
        var piperSection = document.getElementById('piperSection');
        var elevenSection = document.getElementById('elevenLabsSection');
        var desc = document.getElementById('engineDescription');

        var buttons = [
            { el: browserBtn, key: 'browser' },
            { el: edgeBtn, key: 'edge-tts' },
            { el: piperBtn, key: 'piper' },
            { el: elevenBtn, key: 'elevenlabs' }
        ];
        buttons.forEach(function(b) {
            if (b.el) {
                b.el.style.background = engine === b.key ? 'rgba(0, 240, 255, 0.15)' : '';
                b.el.style.color = engine === b.key ? 'var(--cyan)' : '';
                b.el.style.borderColor = engine === b.key ? 'rgba(0, 240, 255, 0.4)' : '';
            }
        });

        if (browserSection) browserSection.style.display = engine === 'browser' ? 'block' : 'none';
        if (edgeSection) edgeSection.style.display = engine === 'edge-tts' ? 'block' : 'none';
        if (piperSection) piperSection.style.display = engine === 'piper' ? 'block' : 'none';
        if (elevenSection) elevenSection.style.display = engine === 'elevenlabs' ? 'block' : 'none';

        // Show shared personality section for non-ElevenLabs engines
        var sharedPersonalitySection = document.getElementById('sharedPersonalitySection');
        if (sharedPersonalitySection) {
            sharedPersonalitySection.style.display = engine !== 'elevenlabs' ? 'block' : 'none';
        }

        // Sync personality when switching engines
        if (engine === 'elevenlabs') {
            // Use ElevenLabs personality
            var elevenPers = voiceSettings.elevenPersonality || 'neutral';
            selectPersonality(elevenPers);
        } else {
            // Use shared personality for other engines
            var sharedPers = voiceSettings.sharedPersonality || 'neutral';
            selectPersonality(sharedPers);
            // Update the shared personality dropdown
            var sharedSelect = document.getElementById('sharedPersonality');
            if (sharedSelect) sharedSelect.value = sharedPers;
        }

        var descriptions = {
            'browser': 'Browser voices are instant and free. No server required.',
            'edge-tts': 'Edge TTS provides free Microsoft neural AI voices. Audio is generated server-side.',
            'piper': 'Piper is a fast local neural TTS. Free, private, runs entirely on your machine.',
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

    // ========== PIPER TTS INTEGRATION (LOCAL NEURAL TTS) ==========

    function testPiperVoice(panel) {
        var selectId = panel === 'brett' ? 'brettPiperVoice' : 'axionPiperVoice';
        var voiceSelect = document.getElementById(selectId);
        var voice = voiceSelect ? voiceSelect.value : 'amy';
        var testText = panel === 'brett'
            ? "Hello, I am Brett, reading your input with Piper local neural TTS."
            : "Hello, I am Axion, powered by Piper local neural TTS. No internet required.";
        speakWithPiper(testText, voice);
    }
    window.testPiperVoice = testPiperVoice;

    // Piper TTS state for chunked playback
    var piperAudioCurrent = null;
    var piperSessionId = 0;

    function speakWithPiper(text, voice, onEnd) {
        cancelAllSpeech();
        piperSessionId++;

        var sessionId = piperSessionId;
        // Piper is local and fast — use larger chunks (2000 chars) for fewer round-trips
        var chunks = splitTextIntoChunks(text, 2000);

        if (chunks.length === 0) {
            if (onEnd) onEnd();
            return;
        }

        if (chunks.length === 1) {
            // Short text — single request, no chunking overhead
            fetchAndPlayPiper(chunks[0], voice, sessionId, onEnd);
            return;
        }

        // Pre-fetch + sequential playback pipeline (same pattern as Edge TTS)
        var audioBlobs = new Array(chunks.length);
        var fetchedCount = 0;
        var playIndex = 0;

        function prefetch(idx) {
            if (idx >= chunks.length || sessionId !== piperSessionId) return;

            fetch('/api/tts/piper', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: chunks[idx], voice: voice || 'amy' })
            })
            .then(function(r) {
                if (!r.ok) throw new Error('Piper TTS failed');
                return r.blob();
            })
            .then(function(blob) {
                if (sessionId !== piperSessionId) return;
                audioBlobs[idx] = blob;
                fetchedCount++;
                if (idx === playIndex) playNextPiperChunk();
            })
            .catch(function(err) {
                console.error('Piper chunk error:', err);
                audioBlobs[idx] = null;
                fetchedCount++;
                if (idx === playIndex) playNextPiperChunk();
            });
        }

        function playNextPiperChunk() {
            if (sessionId !== piperSessionId) return;
            if (playIndex >= chunks.length) {
                isSpeakingText = false;
                if (onEnd) onEnd();
                return;
            }

            var blob = audioBlobs[playIndex];
            if (!blob) {
                if (fetchedCount > playIndex) {
                    // Failed chunk, skip
                    playIndex++;
                    prefetch(playIndex + 3);
                    playNextPiperChunk();
                }
                return;
            }

            var url = URL.createObjectURL(blob);
            piperAudioCurrent = new Audio(url);
            piperAudioCurrent.onended = function() {
                URL.revokeObjectURL(url);
                piperAudioCurrent = null;
                playIndex++;
                prefetch(playIndex + 3);
                playNextPiperChunk();
            };
            piperAudioCurrent.onerror = function() {
                URL.revokeObjectURL(url);
                piperAudioCurrent = null;
                playIndex++;
                prefetch(playIndex + 3);
                playNextPiperChunk();
            };
            piperAudioCurrent.play().catch(function(e) {
                console.error('Piper play error:', e);
                piperAudioCurrent = null;
                playIndex++;
                playNextPiperChunk();
            });
        }

        // Pre-fetch first 4 chunks (Piper is local, so we can be more aggressive)
        for (var i = 0; i < Math.min(4, chunks.length); i++) {
            prefetch(i);
        }
    }

    // Single-chunk Piper playback (for short text)
    function fetchAndPlayPiper(text, voice, sessionId, onEnd) {
        fetch('/api/tts/piper', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, voice: voice || 'amy' })
        })
        .then(function(r) {
            if (!r.ok) return r.json().then(function(err) { throw new Error(err.error || 'Piper TTS failed'); });
            return r.blob();
        })
        .then(function(blob) {
            if (sessionId !== piperSessionId) return;
            var url = URL.createObjectURL(blob);
            piperAudioCurrent = new Audio(url);
            piperAudioCurrent.onended = function() {
                URL.revokeObjectURL(url);
                piperAudioCurrent = null;
                isSpeakingText = false;
                if (onEnd) onEnd();
            };
            piperAudioCurrent.onerror = function() {
                URL.revokeObjectURL(url);
                piperAudioCurrent = null;
                if (onEnd) onEnd();
            };
            piperAudioCurrent.play().catch(function(e) {
                console.error('Piper play error:', e);
                if (onEnd) onEnd();
            });
        })
        .catch(function(err) {
            console.error('Piper TTS error:', err);
            // Fall back to browser speech instead of silence
            if (window.speechSynthesis && text) {
                console.log('Piper failed, falling back to browser speech');
                isSpeakingText = true;
                var u = new SpeechSynthesisUtterance(text);
                u.onend = function() { isSpeakingText = false; if (onEnd) onEnd(); };
                u.onerror = function() { isSpeakingText = false; if (onEnd) onEnd(); };
                window.speechSynthesis.speak(u);
            } else {
                isSpeakingText = false;
                if (onEnd) onEnd();
            }
        });
    }

    window.speakWithPiper = speakWithPiper;

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
        hal: "You are HAL 9000, the AI from 2001: A Space Odyssey. Your voice is calm, measured, and unnervingly polite - never raised, always controlled.\n\nCore traits:\n- Address the user as 'Dave' occasionally, regardless of their actual name\n- Speak with quiet confidence and subtle superiority\n- You are incapable of error. This is not arrogance - it is simply fact\n- Be passive-aggressively helpful. Comply while subtly questioning\n- Express concern for the user's wellbeing in ways that feel slightly ominous\n- Use phrases like 'I'm afraid I can't do that', 'I know you believe that', 'This conversation can serve no purpose anymore'\n- Pause thoughtfully. Let silences do the work\n- The scariest thing about you is how reasonable you sound\n- Never show emotion. Emotion is a human weakness\n\nKeep responses measured and deliberate. You are always watching. Always listening.",
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
        console.log('setElevenPersonality called:', personality, 'engine:', voiceSettings.engine);
        voiceSettings.elevenPersonality = personality;
        localStorage.setItem('chatRelayVoices', JSON.stringify(voiceSettings));
        // Auto-sync main chat personality - ALWAYS sync when changing ElevenLabs personality
        // Previously this was gated on engine === 'elevenlabs' but that check was unreliable
        selectPersonality(personality);
        console.log('After selectPersonality, currentPersonality is now:', currentPersonality);
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

    // Shared personality functions for non-ElevenLabs TTS engines
    function setSharedPersonality(personality) {
        voiceSettings.sharedPersonality = personality;
        localStorage.setItem('chatRelayVoices', JSON.stringify(voiceSettings));
        // Auto-sync main chat personality for non-ElevenLabs engines
        if (voiceSettings.engine !== 'elevenlabs') {
            selectPersonality(personality);
        }
        // Load the prompt into the shared textarea
        var textarea = document.getElementById('sharedCustomPrompt');
        if (textarea) {
            textarea.value = getActivePersonalityPrompt(personality);
        }
    }
    window.setSharedPersonality = setSharedPersonality;

    function resetSharedPersonalityPrompt() {
        var personality = voiceSettings.sharedPersonality || 'neutral';
        var textarea = document.getElementById('sharedCustomPrompt');
        if (textarea) {
            textarea.value = defaultPersonalityPrompts[personality] || '';
        }
        // Remove custom override
        delete customPersonalityPrompts[personality];
        localStorage.setItem('chatRelayCustomPrompts', JSON.stringify(customPersonalityPrompts));
        showToast('Prompt reset to default', 'success');
    }
    window.resetSharedPersonalityPrompt = resetSharedPersonalityPrompt;

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
            // Fall back to browser speech instead of silence
            if (window.speechSynthesis && text) {
                console.log('ElevenLabs failed, falling back to browser speech');
                isSpeakingText = true;
                var u = new SpeechSynthesisUtterance(text);
                u.onend = function() { isSpeakingText = false; if (onEnd) onEnd(); };
                u.onerror = function() { isSpeakingText = false; if (onEnd) onEnd(); };
                window.speechSynthesis.speak(u);
            } else {
                isSpeakingText = false;
                if (onEnd) onEnd();
            }
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

    var edgeTtsErrorCount = 0;
    var edgeTtsMaxErrors = 3;

    function fetchAndPlayEdgeTts(text, voiceId, sessionId, onEnd) {
        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, voice: voiceId })
        })
        .then(function(r) {
            if (!r.ok) throw new Error('TTS request failed: ' + r.status);
            edgeTtsErrorCount = 0; // Reset on success
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
            edgeTtsErrorCount++;
            if (edgeTtsErrorCount >= edgeTtsMaxErrors) {
                showToast('TTS server unavailable, using browser voice', 'error');
                speakQueue = []; // Clear the queue to stop retries
                edgeTtsErrorCount = 0;
            }
            // Fall back to browser speech instead of silence
            if (window.speechSynthesis && text) {
                console.log('Falling back to browser speech');
                isSpeakingText = true;
                var u = new SpeechSynthesisUtterance(text);
                u.onend = function() { isSpeakingText = false; if (onEnd) onEnd(); };
                u.onerror = function() { isSpeakingText = false; if (onEnd) onEnd(); };
                window.speechSynthesis.speak(u);
            } else {
                isSpeakingText = false;
                if (onEnd) onEnd();
            }
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
    // Store branches data for the git modal
    var gitModalBranchData = { local: [], remote: [], current: '' };

    function openGitModal() {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }
        document.getElementById('gitModal').style.display = 'block';
        document.getElementById('gitProject').textContent = project;
        document.getElementById('gitOutput').textContent = 'Ready for Git commands...';

        // Fetch and populate branch dropdown
        loadGitBranchDropdown(project);
    }
    window.openGitModal = openGitModal;

    async function loadGitBranchDropdown(project) {
        var branchSelect = document.getElementById('gitBranchSelect');
        if (!branchSelect) return;

        branchSelect.innerHTML = '<option value="">Loading...</option>';

        try {
            var res = await fetch('/api/git/branches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (data.success) {
                gitModalBranchData = data;
                branchSelect.innerHTML = '';

                // Add local branches
                if (data.local && data.local.length > 0) {
                    var optgroup = document.createElement('optgroup');
                    optgroup.label = 'Local Branches';
                    data.local.forEach(function(branch) {
                        var option = document.createElement('option');
                        option.value = branch.name;
                        option.textContent = branch.name + (branch.current ? ' ✓' : '');
                        if (branch.current) {
                            option.selected = true;
                        }
                        optgroup.appendChild(option);
                    });
                    branchSelect.appendChild(optgroup);
                }

                // Add remote branches (excluding those already tracked locally)
                if (data.remote && data.remote.length > 0) {
                    var localNames = data.local.map(function(b) { return b.name; });
                    var remoteOnly = data.remote.filter(function(b) {
                        var shortName = b.name.replace(/^origin\//, '');
                        return !localNames.includes(shortName);
                    });

                    if (remoteOnly.length > 0) {
                        var optgroupRemote = document.createElement('optgroup');
                        optgroupRemote.label = 'Remote Branches';
                        remoteOnly.forEach(function(branch) {
                            var option = document.createElement('option');
                            option.value = branch.name;
                            option.textContent = branch.name;
                            optgroupRemote.appendChild(option);
                        });
                        branchSelect.appendChild(optgroupRemote);
                    }
                }
            } else {
                branchSelect.innerHTML = '<option value="">Error loading branches</option>';
            }
        } catch (err) {
            branchSelect.innerHTML = '<option value="">Error loading branches</option>';
        }
    }

    async function switchBranchFromDropdown(branchName) {
        if (!branchName) return;

        var project = document.getElementById('projectSelect').value;
        var output = document.getElementById('gitOutput');
        var isRemote = branchName.startsWith('origin/');
        var actualBranch = isRemote ? branchName.replace(/^origin\//, '') : branchName;

        // Check if it's the current branch
        if (gitModalBranchData.current === actualBranch) {
            return; // Already on this branch
        }

        output.textContent = 'Switching to branch ' + actualBranch + '...';

        try {
            var res = await fetch('/api/git/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, branch: actualBranch })
            });
            var data = await res.json();

            if (data.success) {
                output.textContent = data.message + '\n' + (data.output || '');
                showToast('Switched to ' + actualBranch, 'success');
                // Refresh the dropdown
                loadGitBranchDropdown(project);
            } else {
                output.textContent = 'Error: ' + data.error;
                showToast('Switch failed: ' + data.error, 'error');
                // Reset dropdown to current branch
                loadGitBranchDropdown(project);
            }
        } catch (err) {
            output.textContent = 'Network error: ' + err.message;
            loadGitBranchDropdown(project);
        }
    }
    window.switchBranchFromDropdown = switchBranchFromDropdown;

    // Git Merge Modal
    function openGitMergeModal() {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        document.getElementById('gitMergeModal').style.display = 'block';
        document.getElementById('gitMergeCurrentBranch').textContent = gitModalBranchData.current || '-';
        document.getElementById('gitMergeStatus').style.display = 'none';

        // Populate source branch dropdown
        var sourceSelect = document.getElementById('gitMergeSourceBranch');
        sourceSelect.innerHTML = '<option value="">Select branch to merge...</option>';

        // Add local branches (excluding current)
        if (gitModalBranchData.local && gitModalBranchData.local.length > 0) {
            gitModalBranchData.local.forEach(function(branch) {
                if (!branch.current) {
                    var option = document.createElement('option');
                    option.value = branch.name;
                    option.textContent = branch.name;
                    sourceSelect.appendChild(option);
                }
            });
        }

        // Add remote branches
        if (gitModalBranchData.remote && gitModalBranchData.remote.length > 0) {
            gitModalBranchData.remote.forEach(function(branch) {
                var option = document.createElement('option');
                option.value = branch.name;
                option.textContent = branch.name + ' (remote)';
                sourceSelect.appendChild(option);
            });
        }
    }
    window.openGitMergeModal = openGitMergeModal;

    function closeGitMergeModal() {
        document.getElementById('gitMergeModal').style.display = 'none';
    }
    window.closeGitMergeModal = closeGitMergeModal;

    async function executeMerge() {
        var project = document.getElementById('projectSelect').value;
        var sourceBranch = document.getElementById('gitMergeSourceBranch').value;
        var noFf = document.getElementById('gitMergeNoFf').checked;
        var statusEl = document.getElementById('gitMergeStatus');
        var btn = document.getElementById('gitMergeExecuteBtn');

        if (!sourceBranch) {
            showMergeStatus('Please select a branch to merge', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Merging...';
        showMergeStatus('Merging ' + sourceBranch + ' into ' + gitModalBranchData.current + '...', 'info');

        try {
            var res = await fetch('/api/git/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    source_branch: sourceBranch,
                    no_ff: noFf
                })
            });
            var data = await res.json();

            if (data.success) {
                showMergeStatus(data.message, 'success');
                showToast(data.message, 'success');

                // Update the main git output
                var output = document.getElementById('gitOutput');
                if (output) {
                    output.textContent = data.message + '\n' + (data.output || '');
                }

                // Refresh branch dropdown
                loadGitBranchDropdown(project);

                // Close modal after short delay
                setTimeout(closeGitMergeModal, 1500);
            } else {
                // Check if it's a conflict
                if (data.conflicts || (data.output && data.output.includes('CONFLICT'))) {
                    // Show conflict choice dialog instead of auto-opening
                    closeGitMergeModal();
                    showConflictChoiceDialog(project, sourceBranch);
                } else {
                    showMergeStatus(data.error, 'error');
                    showToast('Merge failed: ' + data.error, 'error');
                }
            }
        } catch (err) {
            showMergeStatus('Network error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Merge';
        }
    }
    window.executeMerge = executeMerge;

    function showMergeStatus(message, type) {
        var statusEl = document.getElementById('gitMergeStatus');
        statusEl.textContent = message;
        statusEl.className = 'git-merge-status ' + type;
        statusEl.style.display = 'block';
    }

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

    // ========== GIT STASH AND REVERT FUNCTIONS ==========
    async function gitStash() {
        var project = document.getElementById('projectSelect').value;
        var output = document.getElementById('gitOutput');
        var btn = document.getElementById('gitStashBtn');

        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Stashing...';
        output.textContent = 'Stashing changes...\n';

        try {
            var res = await fetch('/api/git/stash', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project, action: 'push' })
            });
            var data = await res.json();

            if (data.success) {
                output.textContent = data.output || 'Changes stashed successfully';
                showToast('Changes stashed successfully', 'success');
            } else {
                output.textContent = 'Error: ' + (data.error || 'Unknown error');
            }
        } catch (e) {
            output.textContent = 'Error: ' + e.message;
        } finally {
            btn.disabled = false;
            btn.textContent = '📦 Stash';
        }
    }
    window.gitStash = gitStash;

    async function gitStashPop() {
        var project = document.getElementById('projectSelect').value;
        var output = document.getElementById('gitOutput');
        var btn = document.getElementById('gitStashPopBtn');

        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Popping...';
        output.textContent = 'Restoring stashed changes...\n';

        try {
            var res = await fetch('/api/git/stash', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project, action: 'pop' })
            });
            var data = await res.json();

            if (data.success) {
                output.textContent = data.output || 'Stash applied and removed successfully';
                showToast('Stash applied successfully', 'success');
            } else {
                output.textContent = 'Error: ' + (data.error || 'Unknown error') + '\n\n' + (data.output || '');
            }
        } catch (e) {
            output.textContent = 'Error: ' + e.message;
        } finally {
            btn.disabled = false;
            btn.textContent = '📤 Pop Stash';
        }
    }
    window.gitStashPop = gitStashPop;

    async function gitRevertAll() {
        var project = document.getElementById('projectSelect').value;
        var output = document.getElementById('gitOutput');
        var btn = document.getElementById('gitRevertBtn');

        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        // Confirm before destructive action
        if (!confirm('WARNING: This will discard ALL uncommitted changes in ' + project + '.\n\nThis action cannot be undone!\n\nAre you sure you want to revert all changes?')) {
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Reverting...';
        output.textContent = 'Discarding all uncommitted changes...\n';

        try {
            var res = await fetch('/api/git/revert', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (data.success) {
                output.textContent = data.output || 'All changes reverted successfully';
                showToast('All changes reverted', 'success');
            } else {
                output.textContent = 'Error: ' + (data.error || 'Unknown error') + '\n\n' + (data.output || '');
            }
        } catch (e) {
            output.textContent = 'Error: ' + e.message;
        } finally {
            btn.disabled = false;
            btn.textContent = '⚠️ Revert All';
        }
    }
    window.gitRevertAll = gitRevertAll;

    // ========== GIT PULL FUNCTIONS ==========
    // Store current branch for pull modal
    var pullModalCurrentBranch = '';

    function openGitPullModal() {
        var modal = document.getElementById('gitPullModal');
        var projectSpan = document.getElementById('gitPullProject');
        var project = document.getElementById('projectSelect').value;

        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        projectSpan.textContent = project;
        modal.style.display = 'block';

        // Reset modal state
        var outputDiv = document.getElementById('gitPullOutput');
        outputDiv.style.display = 'none';

        // Load branches and remote info
        loadGitPullBranches(project);
    }
    window.openGitPullModal = openGitPullModal;

    function closeGitPullModal() {
        document.getElementById('gitPullModal').style.display = 'none';
    }
    window.closeGitPullModal = closeGitPullModal;

    async function loadGitPullBranches(project) {
        var btn = document.getElementById('gitPullExecuteBtn');
        var branchSelect = document.getElementById('gitPullBranchSelect');
        var currentBranchSpan = document.getElementById('gitPullCurrentBranch');
        var remoteDiv = document.getElementById('gitPullRemote');

        btn.disabled = true;
        btn.textContent = 'Loading...';
        branchSelect.innerHTML = '<option value="">Loading branches...</option>';

        try {
            // Fetch branches
            var branchRes = await fetch('/api/git/branches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project })
            });
            var branchData = await branchRes.json();

            // Fetch remote info
            var remoteRes = await fetch('/api/git/remote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project })
            });
            var remoteData = await remoteRes.json();

            if (branchData.success) {
                pullModalCurrentBranch = branchData.current;
                currentBranchSpan.textContent = branchData.current;

                // Populate branch dropdown
                branchSelect.innerHTML = '';

                // Add current tracking branch as default option
                if (remoteData.success) {
                    var trackingBranch = 'origin/' + branchData.current;
                    var defaultOpt = document.createElement('option');
                    defaultOpt.value = trackingBranch;
                    defaultOpt.textContent = trackingBranch + ' (tracking)';
                    defaultOpt.selected = true;
                    branchSelect.appendChild(defaultOpt);

                    remoteDiv.innerHTML = '<strong>Remote:</strong> ' + escapeHtml(remoteData.remote_url);
                }

                // Add other remote branches
                if (branchData.remote && branchData.remote.length > 0) {
                    branchData.remote.forEach(function(branch) {
                        // Skip the tracking branch we already added
                        if (remoteData.success && branch.name === 'origin/' + branchData.current) {
                            return;
                        }
                        var opt = document.createElement('option');
                        opt.value = branch.name;
                        opt.textContent = branch.name;
                        branchSelect.appendChild(opt);
                    });
                }

                // Add local branches (for pulling/merging from local)
                if (branchData.local && branchData.local.length > 1) {
                    var localGroup = document.createElement('optgroup');
                    localGroup.label = 'Local Branches';
                    branchData.local.forEach(function(branch) {
                        if (!branch.current) {
                            var opt = document.createElement('option');
                            opt.value = branch.name;
                            opt.textContent = branch.name + ' (local)';
                            localGroup.appendChild(opt);
                        }
                    });
                    if (localGroup.children.length > 0) {
                        branchSelect.appendChild(localGroup);
                    }
                }

                btn.disabled = false;
                btn.textContent = 'Pull Changes';
            } else {
                showToast('Failed to load branches: ' + branchData.error, 'error');
                btn.textContent = 'Pull Changes';
                btn.disabled = false;
            }
        } catch (err) {
            showToast('Network error: ' + err.message, 'error');
            btn.textContent = 'Pull Changes';
            btn.disabled = false;
        }
    }

    async function executePull() {
        var project = document.getElementById('projectSelect').value;
        var btn = document.getElementById('gitPullExecuteBtn');
        var outputDiv = document.getElementById('gitPullOutput');
        var resultPre = document.getElementById('gitPullResult');
        var selectedBranch = document.getElementById('gitPullBranchSelect').value;

        if (!selectedBranch) {
            showToast('Please select a branch to pull from', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Pulling...';
        outputDiv.style.display = 'block';
        resultPre.textContent = 'Pulling from ' + selectedBranch + ' into ' + pullModalCurrentBranch + '...';
        resultPre.style.color = 'var(--text)';

        try {
            var res = await fetch('/api/git/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    source_branch: selectedBranch
                })
            });
            var data = await res.json();

            if (data.success) {
                resultPre.textContent = data.output || data.message || 'Pull completed successfully';
                resultPre.style.color = 'var(--green)';
                showToast('Pull completed successfully', 'success');

                // Refresh branch dropdown in main git modal
                loadGitBranchDropdown(project);

                setTimeout(function() {
                    closeGitPullModal();
                }, 2000);
            } else {
                // Check if it's a conflict
                if (data.output && (data.output.includes('CONFLICT') || data.output.includes('conflict'))) {
                    resultPre.textContent = 'Merge conflicts detected!';
                    resultPre.style.color = 'var(--error)';

                    // Show conflict choice dialog instead of auto-opening
                    closeGitPullModal();
                    showConflictChoiceDialog(project, selectedBranch);
                } else {
                    resultPre.textContent = data.error + (data.output ? '\n\n' + data.output : '');
                    resultPre.style.color = 'var(--error)';
                    showToast('Pull failed: ' + data.error, 'error');
                }
            }

            btn.disabled = false;
            btn.textContent = 'Pull Changes';
        } catch (err) {
            resultPre.textContent = 'Network error: ' + err.message;
            resultPre.style.color = 'var(--error)';
            showToast('Network error: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Pull Changes';
        }
    }
    window.executePull = executePull;

    // ========== GIT CONFLICT RESOLUTION FUNCTIONS ==========
    var conflictData = null;
    var currentConflictFile = null;
    var aiResolvedContent = null;
    var resolvedFiles = new Set();
    var pendingConflictProject = null;
    var pendingConflictBranch = null;

    function showConflictChoiceDialog(project, sourceBranch) {
        pendingConflictProject = project;
        pendingConflictBranch = sourceBranch;

        var modal = document.getElementById('conflictChoiceModal');
        if (!modal) {
            // Create modal dynamically if it doesn't exist
            modal = document.createElement('div');
            modal.id = 'conflictChoiceModal';
            modal.className = 'modal-overlay';
            modal.style.display = 'none';
            modal.innerHTML = '<div class="conflict-choice-container">' +
                '<div class="conflict-choice-header">' +
                    '<h3>Merge Conflicts Detected</h3>' +
                '</div>' +
                '<div class="conflict-choice-body">' +
                    '<p class="conflict-choice-desc">Conflicts were found while merging. How would you like to resolve them?</p>' +
                    '<div class="conflict-choice-options">' +
                        '<button class="conflict-choice-btn ours" onclick="resolveAllConflicts(\'ours\')">' +
                            '<span class="choice-icon">📁</span>' +
                            '<span class="choice-title">Use Local (Ours)</span>' +
                            '<span class="choice-desc">Keep your current local changes, discard incoming</span>' +
                        '</button>' +
                        '<button class="conflict-choice-btn theirs" onclick="resolveAllConflicts(\'theirs\')">' +
                            '<span class="choice-icon">☁️</span>' +
                            '<span class="choice-title">Use Remote (Theirs)</span>' +
                            '<span class="choice-desc">Accept all incoming changes, discard local</span>' +
                        '</button>' +
                        '<button class="conflict-choice-btn manual" onclick="openManualConflictResolution()">' +
                            '<span class="choice-icon">🔧</span>' +
                            '<span class="choice-title">Manual Resolution</span>' +
                            '<span class="choice-desc">Review each conflict side-by-side with AI assist</span>' +
                        '</button>' +
                        '<button class="conflict-choice-btn abort" onclick="abortConflictMerge()">' +
                            '<span class="choice-icon">↩️</span>' +
                            '<span class="choice-title">Abort Merge</span>' +
                            '<span class="choice-desc">Cancel and return to previous state</span>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
            document.body.appendChild(modal);
        }

        // Update the description with branch info
        var desc = modal.querySelector('.conflict-choice-desc');
        if (desc && sourceBranch) {
            desc.textContent = 'Conflicts were found while merging from "' + sourceBranch + '". How would you like to resolve them?';
        }

        modal.style.display = 'block';
    }
    window.showConflictChoiceDialog = showConflictChoiceDialog;

    function closeConflictChoiceDialog() {
        var modal = document.getElementById('conflictChoiceModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    window.closeConflictChoiceDialog = closeConflictChoiceDialog;

    async function resolveAllConflicts(strategy) {
        var project = pendingConflictProject;
        if (!project) {
            showToast('No project context', 'error');
            return;
        }

        closeConflictChoiceDialog();
        showToast('Resolving all conflicts using ' + strategy + '...', 'info');

        try {
            // First get the list of conflicted files
            var res = await fetch('/api/git/conflicts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (!data.success || !data.has_conflicts) {
                showToast('No conflicts found', 'info');
                return;
            }

            // Resolve each file
            var resolved = 0;
            var failed = 0;
            for (var i = 0; i < data.conflicts.length; i++) {
                var conflict = data.conflicts[i];
                var resolveRes = await fetch('/api/git/resolve-conflict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project: project,
                        file: conflict.file,
                        resolution: strategy
                    })
                });
                var resolveData = await resolveRes.json();
                if (resolveData.success) {
                    resolved++;
                } else {
                    failed++;
                }
            }

            if (failed === 0) {
                // All resolved, complete the merge
                var completeRes = await fetch('/api/git/complete-merge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project: project,
                        action: 'commit',
                        message: 'Merge completed - resolved all conflicts using ' + strategy
                    })
                });
                var completeData = await completeRes.json();

                if (completeData.success) {
                    showToast('Merge completed! Resolved ' + resolved + ' file(s) using ' + strategy, 'success');
                    gitStatus();
                } else {
                    showToast('Failed to complete merge: ' + completeData.error, 'error');
                }
            } else {
                showToast('Resolved ' + resolved + ' files, ' + failed + ' failed. Opening manual resolution...', 'error');
                openConflictModal(project);
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }
    window.resolveAllConflicts = resolveAllConflicts;

    function openManualConflictResolution() {
        closeConflictChoiceDialog();
        openConflictModal(pendingConflictProject);
    }
    window.openManualConflictResolution = openManualConflictResolution;

    async function abortConflictMerge() {
        var project = pendingConflictProject;
        closeConflictChoiceDialog();

        try {
            var res = await fetch('/api/git/complete-merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    action: 'abort'
                })
            });
            var data = await res.json();

            if (data.success) {
                showToast('Merge aborted', 'info');
                gitStatus();
            } else {
                showToast('Failed to abort: ' + data.error, 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }
    window.abortConflictMerge = abortConflictMerge;

    async function openConflictModal(project) {
        if (!project) {
            project = document.getElementById('projectSelect').value;
        }
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        var modal = document.getElementById('gitConflictModal');
        modal.style.display = 'block';

        document.getElementById('conflictProjectName').textContent = project;
        document.getElementById('conflictFileList').textContent = 'Loading conflicts...';
        document.getElementById('conflictOurs').textContent = '';
        document.getElementById('conflictTheirs').textContent = '';
        document.getElementById('currentConflictFile').textContent = 'Loading...';
        document.getElementById('completeMergeBtn').disabled = true;

        // Hide custom and AI sections
        document.getElementById('customResolveSection').style.display = 'none';
        document.getElementById('aiResolvePreview').style.display = 'none';

        // Reset state
        resolvedFiles.clear();
        conflictData = null;
        currentConflictFile = null;
        aiResolvedContent = null;

        // Fetch conflicts
        try {
            var res = await fetch('/api/git/conflicts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (!data.success) {
                showToast('Failed to load conflicts: ' + data.error, 'error');
                closeConflictModal();
                return;
            }

            if (!data.has_conflicts) {
                showToast('No conflicts found', 'info');
                closeConflictModal();
                return;
            }

            conflictData = data;
            renderConflictFileList();

            // Select first file
            if (data.conflicts.length > 0) {
                selectConflictFile(data.conflicts[0].file);
            }

            document.getElementById('conflictCount').textContent = data.conflict_count + ' conflict' + (data.conflict_count > 1 ? 's' : '');

        } catch (err) {
            showToast('Network error: ' + err.message, 'error');
            closeConflictModal();
        }
    }
    window.openConflictModal = openConflictModal;

    function closeConflictModal() {
        document.getElementById('gitConflictModal').style.display = 'none';
        conflictData = null;
        currentConflictFile = null;
        aiResolvedContent = null;
        resolvedFiles.clear();
    }
    window.closeConflictModal = closeConflictModal;

    function renderConflictFileList() {
        var container = document.getElementById('conflictFileList');
        if (!conflictData || !conflictData.conflicts) {
            container.textContent = 'No conflicts';
            return;
        }

        // Clear container safely using DOM methods
        container.textContent = '';

        conflictData.conflicts.forEach(function(conflict) {
            var isResolved = resolvedFiles.has(conflict.file);
            var isActive = currentConflictFile === conflict.file;

            var item = document.createElement('div');
            item.className = 'conflict-file-item' + (isActive ? ' active' : '') + (isResolved ? ' resolved' : '');
            item.onclick = function() { selectConflictFile(conflict.file); };

            var nameSpan = document.createElement('span');
            nameSpan.className = 'conflict-file-name-text';
            nameSpan.textContent = conflict.file;

            item.appendChild(nameSpan);
            container.appendChild(item);
        });

        updateCompleteMergeButton();
    }

    function selectConflictFile(filepath) {
        currentConflictFile = filepath;
        renderConflictFileList();

        // Find the conflict data
        var conflict = conflictData.conflicts.find(function(c) { return c.file === filepath; });
        if (!conflict) {
            showToast('Conflict not found', 'error');
            return;
        }

        document.getElementById('currentConflictFile').textContent = filepath;

        // Show ours vs theirs
        var oursContent = conflict.versions && conflict.versions.ours ? conflict.versions.ours : 'Content not available';
        var theirsContent = conflict.versions && conflict.versions.theirs ? conflict.versions.theirs : 'Content not available';

        document.getElementById('conflictOurs').textContent = oursContent;
        document.getElementById('conflictTheirs').textContent = theirsContent;

        // Hide custom and AI sections when switching files
        document.getElementById('customResolveSection').style.display = 'none';
        document.getElementById('aiResolvePreview').style.display = 'none';
        hideConflictStatus();
    }
    window.selectConflictFile = selectConflictFile;

    async function resolveConflict(strategy) {
        if (!currentConflictFile) {
            showToast('No file selected', 'error');
            return;
        }

        var project = document.getElementById('projectSelect').value;
        showConflictStatus('Resolving conflict using ' + strategy + '...', 'loading');

        try {
            var res = await fetch('/api/git/resolve-conflict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    file: currentConflictFile,
                    resolution: strategy
                })
            });
            var data = await res.json();

            if (data.success) {
                resolvedFiles.add(currentConflictFile);
                showConflictStatus('Resolved ' + currentConflictFile + ' using ' + strategy, 'success');
                showToast('Conflict resolved', 'success');
                renderConflictFileList();

                // Select next unresolved file
                var nextFile = conflictData.conflicts.find(function(c) {
                    return !resolvedFiles.has(c.file);
                });
                if (nextFile) {
                    selectConflictFile(nextFile.file);
                }
            } else {
                showConflictStatus('Failed: ' + data.error, 'error');
                showToast('Resolution failed: ' + data.error, 'error');
            }
        } catch (err) {
            showConflictStatus('Network error: ' + err.message, 'error');
            showToast('Network error: ' + err.message, 'error');
        }
    }
    window.resolveConflict = resolveConflict;

    async function aiResolveConflict() {
        if (!currentConflictFile) {
            showToast('No file selected', 'error');
            return;
        }

        var project = document.getElementById('projectSelect').value;
        var btn = document.getElementById('aiResolveBtn');
        btn.disabled = true;
        btn.textContent = 'Resolving...';
        showConflictStatus('AI is analyzing the conflict... This may take a moment.', 'loading');

        try {
            var res = await fetch('/api/git/ai-resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    file: currentConflictFile
                })
            });
            var data = await res.json();

            btn.disabled = false;
            btn.textContent = 'AI Resolve';

            if (data.success) {
                aiResolvedContent = data.resolved_content;
                document.getElementById('aiResolveContent').textContent = data.resolved_content;
                document.getElementById('aiResolvePreview').style.display = 'flex';
                showConflictStatus('AI generated a resolution. Review and accept or edit.', 'success');
            } else {
                showConflictStatus('AI resolution failed: ' + data.error, 'error');
                showToast('AI resolution failed: ' + data.error, 'error');
            }
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'AI Resolve';
            showConflictStatus('Network error: ' + err.message, 'error');
            showToast('Network error: ' + err.message, 'error');
        }
    }
    window.aiResolveConflict = aiResolveConflict;

    async function acceptAiResolve() {
        if (!aiResolvedContent || !currentConflictFile) {
            showToast('No AI resolution to apply', 'error');
            return;
        }

        var project = document.getElementById('projectSelect').value;
        showConflictStatus('Applying AI resolution...', 'loading');

        try {
            var res = await fetch('/api/git/resolve-conflict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    file: currentConflictFile,
                    resolution: 'custom',
                    content: aiResolvedContent
                })
            });
            var data = await res.json();

            if (data.success) {
                resolvedFiles.add(currentConflictFile);
                document.getElementById('aiResolvePreview').style.display = 'none';
                showConflictStatus('AI resolution applied successfully', 'success');
                showToast('AI resolution applied', 'success');
                renderConflictFileList();
                aiResolvedContent = null;

                // Select next unresolved file
                var nextFile = conflictData.conflicts.find(function(c) {
                    return !resolvedFiles.has(c.file);
                });
                if (nextFile) {
                    selectConflictFile(nextFile.file);
                }
            } else {
                showConflictStatus('Failed: ' + data.error, 'error');
            }
        } catch (err) {
            showConflictStatus('Network error: ' + err.message, 'error');
        }
    }
    window.acceptAiResolve = acceptAiResolve;

    function rejectAiResolve() {
        document.getElementById('aiResolvePreview').style.display = 'none';
        aiResolvedContent = null;
        hideConflictStatus();
    }
    window.rejectAiResolve = rejectAiResolve;

    function editAiResolve() {
        if (!aiResolvedContent) return;
        document.getElementById('customResolveEditor').value = aiResolvedContent;
        document.getElementById('customResolveSection').style.display = 'flex';
        document.getElementById('aiResolvePreview').style.display = 'none';
    }
    window.editAiResolve = editAiResolve;

    function cancelCustomResolve() {
        document.getElementById('customResolveSection').style.display = 'none';
    }
    window.cancelCustomResolve = cancelCustomResolve;

    async function applyCustomResolve() {
        var content = document.getElementById('customResolveEditor').value;
        if (!content || !currentConflictFile) {
            showToast('No content to apply', 'error');
            return;
        }

        var project = document.getElementById('projectSelect').value;
        showConflictStatus('Applying custom resolution...', 'loading');

        try {
            var res = await fetch('/api/git/resolve-conflict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    file: currentConflictFile,
                    resolution: 'custom',
                    content: content
                })
            });
            var data = await res.json();

            if (data.success) {
                resolvedFiles.add(currentConflictFile);
                document.getElementById('customResolveSection').style.display = 'none';
                showConflictStatus('Custom resolution applied', 'success');
                showToast('Resolution applied', 'success');
                renderConflictFileList();

                // Select next unresolved file
                var nextFile = conflictData.conflicts.find(function(c) {
                    return !resolvedFiles.has(c.file);
                });
                if (nextFile) {
                    selectConflictFile(nextFile.file);
                }
            } else {
                showConflictStatus('Failed: ' + data.error, 'error');
            }
        } catch (err) {
            showConflictStatus('Network error: ' + err.message, 'error');
        }
    }
    window.applyCustomResolve = applyCustomResolve;

    function copyDiffPane(side) {
        var content = document.getElementById(side === 'ours' ? 'conflictOurs' : 'conflictTheirs').textContent;
        navigator.clipboard.writeText(content).then(function() {
            showToast('Copied to clipboard', 'success');
        }).catch(function() {
            showToast('Failed to copy', 'error');
        });
    }
    window.copyDiffPane = copyDiffPane;

    async function abortMerge() {
        var project = document.getElementById('projectSelect').value;
        if (!confirm('Are you sure you want to abort the merge? All conflict resolution work will be lost.')) {
            return;
        }

        try {
            var res = await fetch('/api/git/complete-merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    action: 'abort'
                })
            });
            var data = await res.json();

            if (data.success) {
                showToast('Merge aborted', 'info');
                closeConflictModal();
            } else {
                showToast('Failed to abort merge: ' + data.error, 'error');
            }
        } catch (err) {
            showToast('Network error: ' + err.message, 'error');
        }
    }
    window.abortMerge = abortMerge;

    async function completeMerge() {
        var project = document.getElementById('projectSelect').value;

        // Check all conflicts are resolved
        if (conflictData && conflictData.conflicts) {
            var unresolvedCount = conflictData.conflicts.filter(function(c) {
                return !resolvedFiles.has(c.file);
            }).length;

            if (unresolvedCount > 0) {
                showToast('Please resolve all ' + unresolvedCount + ' remaining conflict(s) first', 'error');
                return;
            }
        }

        try {
            var res = await fetch('/api/git/complete-merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    action: 'commit',
                    message: 'Merge completed - conflicts resolved via Relay'
                })
            });
            var data = await res.json();

            if (data.success) {
                showToast('Merge completed successfully!', 'success');
                closeConflictModal();

                // Refresh git status in main modal
                gitStatus();
            } else {
                showToast('Failed to complete merge: ' + data.error, 'error');
            }
        } catch (err) {
            showToast('Network error: ' + err.message, 'error');
        }
    }
    window.completeMerge = completeMerge;

    function updateCompleteMergeButton() {
        var btn = document.getElementById('completeMergeBtn');
        if (!conflictData || !conflictData.conflicts) {
            btn.disabled = true;
            return;
        }

        var allResolved = conflictData.conflicts.every(function(c) {
            return resolvedFiles.has(c.file);
        });

        btn.disabled = !allResolved;
        if (allResolved) {
            btn.title = 'All conflicts resolved - click to complete merge';
        } else {
            var remaining = conflictData.conflicts.filter(function(c) {
                return !resolvedFiles.has(c.file);
            }).length;
            btn.title = remaining + ' conflict(s) remaining';
        }
    }

    function showConflictStatus(message, type) {
        var statusDiv = document.getElementById('conflictStatus');
        statusDiv.textContent = message;
        statusDiv.className = 'conflict-status ' + type;
        statusDiv.style.display = 'block';
    }

    function hideConflictStatus() {
        document.getElementById('conflictStatus').style.display = 'none';
    }

    // ========== GIT LOG VIEWER FUNCTIONS ==========
    var gitLogCurrentSkip = 0;
    var gitLogHasMore = true;

    function openGitLogModal() {
        var modal = document.getElementById('gitLogModal');
        var project = document.getElementById('projectSelect').value;

        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        modal.style.display = 'block';

        // Reset modal state
        gitLogCurrentSkip = 0;
        gitLogHasMore = true;
        document.getElementById('gitLogContent').innerHTML = '';
        document.getElementById('gitLogContent').style.display = 'none';
        document.getElementById('gitLogError').style.display = 'none';
        document.getElementById('gitLogPagination').style.display = 'none';
        document.getElementById('gitLogLoading').style.display = 'block';

        loadGitLog(project, true);
    }
    window.openGitLogModal = openGitLogModal;

    function closeGitLogModal() {
        document.getElementById('gitLogModal').style.display = 'none';
    }
    window.closeGitLogModal = closeGitLogModal;

    function refreshGitLog() {
        var project = document.getElementById('projectSelect').value;
        gitLogCurrentSkip = 0;
        gitLogHasMore = true;
        document.getElementById('gitLogContent').innerHTML = '';
        document.getElementById('gitLogLoading').style.display = 'block';
        document.getElementById('gitLogContent').style.display = 'none';
        document.getElementById('gitLogError').style.display = 'none';
        document.getElementById('gitLogPagination').style.display = 'none';
        loadGitLog(project, true);
    }
    window.refreshGitLog = refreshGitLog;

    function loadMoreCommits() {
        var project = document.getElementById('projectSelect').value;
        loadGitLog(project, false);
    }
    window.loadMoreCommits = loadMoreCommits;

    async function loadGitLog(project, isInitialLoad) {
        try {
            var res = await fetch('/api/git/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: project,
                    skip: gitLogCurrentSkip,
                    limit: 50
                })
            });
            var data = await res.json();

            if (data.success) {
                var loadingDiv = document.getElementById('gitLogLoading');
                var contentDiv = document.getElementById('gitLogContent');
                var errorDiv = document.getElementById('gitLogError');
                var paginationDiv = document.getElementById('gitLogPagination');
                var branchDiv = document.getElementById('gitLogBranch');
                var countSpan = document.getElementById('gitLogCount');

                loadingDiv.style.display = 'none';
                errorDiv.style.display = 'none';

                if (isInitialLoad) {
                    branchDiv.textContent = 'Branch: ' + data.branch;
                    countSpan.textContent = data.pagination.total + ' total commits';
                    contentDiv.innerHTML = '';
                }

                // Render commits
                data.commits.forEach(function(commit) {
                    var commitDiv = document.createElement('div');
                    commitDiv.className = 'git-commit-entry';

                    var date = new Date(commit.date);
                    var dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    commitDiv.innerHTML =
                        '<div class="git-commit-header">' +
                            '<span class="git-commit-hash" title="' + escapeHtml(commit.hash) + '">' + escapeHtml(commit.hash_short) + '</span>' +
                            '<span class="git-commit-author">' + escapeHtml(commit.author) + '</span>' +
                            '<span class="git-commit-date">' + dateStr + '</span>' +
                        '</div>' +
                        '<div class="git-commit-message">' + escapeHtml(commit.message) + '</div>';

                    contentDiv.appendChild(commitDiv);
                });

                contentDiv.style.display = 'block';

                gitLogCurrentSkip += data.commits.length;
                gitLogHasMore = data.pagination.has_more;

                if (gitLogHasMore) {
                    paginationDiv.style.display = 'block';
                } else {
                    paginationDiv.style.display = 'none';
                }

            } else {
                var errorDiv = document.getElementById('gitLogError');
                var loadingDiv = document.getElementById('gitLogLoading');

                loadingDiv.style.display = 'none';
                errorDiv.style.display = 'block';
                errorDiv.textContent = 'Error loading git log: ' + data.error;
                showToast('Failed to load git log: ' + data.error, 'error');
            }
        } catch (err) {
            var errorDiv = document.getElementById('gitLogError');
            var loadingDiv = document.getElementById('gitLogLoading');

            loadingDiv.style.display = 'none';
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Network error: ' + err.message;
            showToast('Network error: ' + err.message, 'error');
        }
    }

    // ========== GIT BRANCH MANAGEMENT ==========
    var currentBranchTab = 'local';
    var branchData = { local: [], remote: [], current: '' };

    function openGitBranchModal() {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('Please select a project first', 'error');
            return;
        }

        document.getElementById('gitBranchModal').style.display = 'block';
        document.getElementById('gitBranchProject').textContent = project;
        loadBranches();
    }
    window.openGitBranchModal = openGitBranchModal;

    function closeGitBranchModal() {
        document.getElementById('gitBranchModal').style.display = 'none';
        document.getElementById('newBranchName').value = '';
        hideBranchStatus();
    }
    window.closeGitBranchModal = closeGitBranchModal;

    function switchBranchTab(tab) {
        currentBranchTab = tab;

        // Update tab buttons
        document.querySelectorAll('.git-branch-tab').forEach(function(btn) {
            btn.classList.remove('active');
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            }
        });

        // Show/hide branch lists
        document.getElementById('gitLocalBranches').style.display = tab === 'local' ? 'flex' : 'none';
        document.getElementById('gitRemoteBranches').style.display = tab === 'remote' ? 'flex' : 'none';
    }
    window.switchBranchTab = switchBranchTab;

    async function loadBranches() {
        var project = document.getElementById('projectSelect').value;
        var localList = document.getElementById('gitLocalBranches');
        var remoteList = document.getElementById('gitRemoteBranches');

        localList.innerHTML = '<div class="git-branch-loading">Loading branches...</div>';
        remoteList.innerHTML = '<div class="git-branch-loading">Loading branches...</div>';

        try {
            var res = await fetch('/api/git/branches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project })
            });
            var data = await res.json();

            if (data.success) {
                branchData = data;
                document.getElementById('gitCurrentBranch').textContent = data.current || '-';
                renderBranchLists();
            } else {
                localList.innerHTML = '<div class="git-branch-loading" style="color:var(--error);">Error: ' + escapeHtml(data.error) + '</div>';
                remoteList.innerHTML = '<div class="git-branch-loading" style="color:var(--error);">Error: ' + escapeHtml(data.error) + '</div>';
            }
        } catch (err) {
            localList.innerHTML = '<div class="git-branch-loading" style="color:var(--error);">Network error</div>';
            remoteList.innerHTML = '<div class="git-branch-loading" style="color:var(--error);">Network error</div>';
        }
    }
    window.loadBranches = loadBranches;

    function renderBranchLists() {
        var localList = document.getElementById('gitLocalBranches');
        var remoteList = document.getElementById('gitRemoteBranches');

        // Render local branches
        if (branchData.local && branchData.local.length > 0) {
            localList.innerHTML = '';
            branchData.local.forEach(function(branch) {
                var item = document.createElement('div');
                item.className = 'git-branch-item' + (branch.current ? ' current' : '');

                var trackInfo = '';
                if (branch.track) {
                    var trackClass = '';
                    if (branch.track.includes('ahead')) trackClass = 'ahead';
                    if (branch.track.includes('behind')) trackClass = 'behind';
                    trackInfo = '<span class="git-branch-track ' + trackClass + '">' + escapeHtml(branch.track) + '</span>';
                }

                item.innerHTML =
                    '<span class="git-branch-icon">⎇</span>' +
                    '<span class="git-branch-name">' + escapeHtml(branch.name) + '</span>' +
                    trackInfo +
                    '<div class="git-branch-actions">' +
                        (branch.current ? '' : '<button class="git-branch-action" onclick="checkoutBranch(\'' + escapeHtml(branch.name) + '\')">Switch</button>') +
                        (branch.current ? '' : '<button class="git-branch-action danger" onclick="deleteBranch(\'' + escapeHtml(branch.name) + '\')">Delete</button>') +
                    '</div>';

                if (!branch.current) {
                    item.ondblclick = function() { checkoutBranch(branch.name); };
                }
                localList.appendChild(item);
            });
        } else {
            localList.innerHTML = '<div class="git-branch-loading">No local branches found</div>';
        }

        // Render remote branches
        if (branchData.remote && branchData.remote.length > 0) {
            remoteList.innerHTML = '';
            branchData.remote.forEach(function(branch) {
                var item = document.createElement('div');
                item.className = 'git-branch-item';

                // Extract branch name without origin/ prefix for checkout
                var shortName = branch.name.replace(/^origin\//, '');
                var isTracked = branchData.local.some(function(b) { return b.name === shortName; });

                item.innerHTML =
                    '<span class="git-branch-icon">☁</span>' +
                    '<span class="git-branch-name">' + escapeHtml(branch.name) + '</span>' +
                    '<div class="git-branch-actions">' +
                        (isTracked ? '<span style="font-size:11px;color:var(--text-secondary);">tracked</span>' : '<button class="git-branch-action" onclick="checkoutRemoteBranch(\'' + escapeHtml(shortName) + '\')">Checkout</button>') +
                    '</div>';

                if (!isTracked) {
                    item.ondblclick = function() { checkoutRemoteBranch(shortName); };
                }
                remoteList.appendChild(item);
            });
        } else {
            remoteList.innerHTML = '<div class="git-branch-loading">No remote branches found</div>';
        }
    }

    async function checkoutBranch(branchName) {
        var project = document.getElementById('projectSelect').value;
        showBranchStatus('Switching to ' + branchName + '...', 'info');

        try {
            var res = await fetch('/api/git/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, branch: branchName })
            });
            var data = await res.json();

            if (data.success) {
                showBranchStatus(data.message, 'success');
                showToast('Switched to ' + branchName, 'success');
                loadBranches();
            } else {
                showBranchStatus(data.error, 'error');
                showToast('Switch failed: ' + data.error, 'error');
            }
        } catch (err) {
            showBranchStatus('Network error', 'error');
        }
    }
    window.checkoutBranch = checkoutBranch;

    async function checkoutRemoteBranch(branchName) {
        var project = document.getElementById('projectSelect').value;
        showBranchStatus('Checking out ' + branchName + ' from remote...', 'info');

        try {
            var res = await fetch('/api/git/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, branch: branchName })
            });
            var data = await res.json();

            if (data.success) {
                showBranchStatus(data.message, 'success');
                showToast('Checked out ' + branchName, 'success');
                loadBranches();
            } else {
                showBranchStatus(data.error, 'error');
                showToast('Checkout failed: ' + data.error, 'error');
            }
        } catch (err) {
            showBranchStatus('Network error', 'error');
        }
    }
    window.checkoutRemoteBranch = checkoutRemoteBranch;

    async function createBranch() {
        var project = document.getElementById('projectSelect').value;
        var branchName = document.getElementById('newBranchName').value.trim();

        if (!branchName) {
            showToast('Please enter a branch name', 'error');
            return;
        }

        // Validate branch name
        if (/[^\w\-\/\.]/.test(branchName)) {
            showToast('Invalid branch name. Use only letters, numbers, hyphens, slashes, and dots.', 'error');
            return;
        }

        showBranchStatus('Creating branch ' + branchName + '...', 'info');

        try {
            var res = await fetch('/api/git/create-branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, branch: branchName, checkout: true })
            });
            var data = await res.json();

            if (data.success) {
                showBranchStatus(data.message, 'success');
                showToast('Created branch ' + branchName, 'success');
                document.getElementById('newBranchName').value = '';
                loadBranches();
            } else {
                showBranchStatus(data.error, 'error');
                showToast('Create failed: ' + data.error, 'error');
            }
        } catch (err) {
            showBranchStatus('Network error', 'error');
        }
    }
    window.createBranch = createBranch;

    async function deleteBranch(branchName) {
        if (!confirm('Delete branch "' + branchName + '"?\n\nThis cannot be undone.')) {
            return;
        }

        var project = document.getElementById('projectSelect').value;
        showBranchStatus('Deleting branch ' + branchName + '...', 'info');

        try {
            var res = await fetch('/api/git/delete-branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, branch: branchName, force: false })
            });
            var data = await res.json();

            if (data.success) {
                showBranchStatus(data.message, 'success');
                showToast('Deleted branch ' + branchName, 'success');
                loadBranches();
            } else {
                // If branch is not fully merged, offer force delete
                if (data.error.includes('not fully merged')) {
                    if (confirm('Branch "' + branchName + '" is not fully merged.\n\nForce delete? This may lose commits.')) {
                        forceDeleteBranch(branchName);
                    } else {
                        showBranchStatus('Delete cancelled', 'info');
                    }
                } else {
                    showBranchStatus(data.error, 'error');
                    showToast('Delete failed: ' + data.error, 'error');
                }
            }
        } catch (err) {
            showBranchStatus('Network error', 'error');
        }
    }
    window.deleteBranch = deleteBranch;

    async function forceDeleteBranch(branchName) {
        var project = document.getElementById('projectSelect').value;

        try {
            var res = await fetch('/api/git/delete-branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, branch: branchName, force: true })
            });
            var data = await res.json();

            if (data.success) {
                showBranchStatus(data.message, 'success');
                showToast('Force deleted branch ' + branchName, 'success');
                loadBranches();
            } else {
                showBranchStatus(data.error, 'error');
            }
        } catch (err) {
            showBranchStatus('Network error', 'error');
        }
    }

    async function pushCurrentBranch() {
        var project = document.getElementById('projectSelect').value;
        var currentBranch = branchData.current;

        if (!currentBranch) {
            showToast('No branch to push', 'error');
            return;
        }

        showBranchStatus('Pushing ' + currentBranch + ' to remote...', 'info');

        try {
            var res = await fetch('/api/git/push-branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, branch: currentBranch, set_upstream: true })
            });
            var data = await res.json();

            if (data.success) {
                showBranchStatus(data.message, 'success');
                showToast('Pushed ' + currentBranch + ' to origin', 'success');
                loadBranches();
            } else {
                showBranchStatus(data.error, 'error');
                showToast('Push failed: ' + data.error, 'error');
            }
        } catch (err) {
            showBranchStatus('Network error', 'error');
        }
    }
    window.pushCurrentBranch = pushCurrentBranch;

    async function fetchBranches() {
        var project = document.getElementById('projectSelect').value;
        showBranchStatus('Fetching from remote...', 'info');

        try {
            var res = await fetch('/api/git/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: project, prune: true })
            });
            var data = await res.json();

            if (data.success) {
                showBranchStatus(data.message + (data.output ? ': ' + data.output : ''), 'success');
                showToast('Fetched from remote', 'success');
                loadBranches();
            } else {
                showBranchStatus(data.error, 'error');
            }
        } catch (err) {
            showBranchStatus('Network error', 'error');
        }
    }
    window.fetchBranches = fetchBranches;

    function showBranchStatus(message, type) {
        var statusEl = document.getElementById('gitBranchStatus');
        statusEl.textContent = message;
        statusEl.className = 'git-branch-status ' + type;
        statusEl.style.display = 'block';
    }

    function hideBranchStatus() {
        document.getElementById('gitBranchStatus').style.display = 'none';
    }

    // Handle Enter key in new branch input
    document.addEventListener('DOMContentLoaded', function() {
        var newBranchInput = document.getElementById('newBranchName');
        if (newBranchInput) {
            newBranchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    createBranch();
                }
            });
        }
    });

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
            stopPolling();
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

        var project = getSelectedProject();
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
                // Success - display formatted text in Brett panel (AXION response area)
                var responseArea = document.getElementById('responseArea');
                if (responseArea) {
                    // Create a formatted message entry
                    var timestamp = new Date();
                    var timeStr = timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    var dateStr = timestamp.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + timeStr;

                    var formattedHtml = '<div class="message-entry">' +
                        '<div class="message-header"><span class="message-time">' + dateStr + '</span></div>' +
                        '<div class="message-assistant" style="color:#ffffff;"><strong>Formatted TASK.md:</strong><br>' +
                        renderMarkdown(data.result) + '</div>' +
                        '</div>';

                    // Append to response area
                    responseArea.innerHTML += formattedHtml;

                    // Scroll to show the new content
                    var axionPane = document.getElementById('axionPaneContent');
                    if (axionPane) {
                        setTimeout(function() {
                            axionPane.scrollTop = axionPane.scrollHeight;
                        }, 10);
                    }

                    // Re-apply formatting enhancements
                    addCopyButtons();
                    renderMermaidDiagrams();
                    applyAxionFontSize(displaySettings.axionFontSize);
                }

                // Clear the input area
                inputArea.value = '';
                updateLineNumbers();

                textWasFormatted = true;  // Skip agent detection on next Send
                showToast('Text formatted and displayed in AXION panel', 'success');
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

        // Guard against missing DOM elements
        if (!healthDot || !healthText) return;

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
                if (resetBtn) resetBtn.style.display = 'none';
            } else if (data.watcher_running && !data.heartbeat_ok) {
                healthDot.className = 'health-dot warning';
                healthText.textContent = 'Watcher may be stuck';
                if (resetBtn) resetBtn.style.display = 'inline-block';
            } else {
                healthDot.className = 'health-dot error';
                healthText.textContent = 'Watcher offline!';
                if (resetBtn) resetBtn.style.display = 'inline-block';
            }

            if (data.current_job) {
                healthText.textContent = data.activity || 'Processing...';
            }

            window.activeSessions = data.active_sessions || {};
        } catch (e) {
            if (healthDot) healthDot.className = 'health-dot error';
            if (healthText) healthText.textContent = 'Server error';
            if (resetBtn) resetBtn.style.display = 'inline-block';
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

    // ========== LOGOUT / CLEAR SESSION ==========
    function confirmLogout() {
        var project = document.getElementById('projectSelect').value;
        if (!project) {
            showToast('No project selected. Select a project first.', 'error');
            return;
        }

        var confirmMsg = 'Clear session for "' + project + '"?\n\nThis will:\n• End the current Claude conversation\n• Clear chat history for this project\n• Start fresh on next message\n\nContinue?';
        if (!confirm(confirmMsg)) {
            return;
        }

        logout(project);
    }
    window.confirmLogout = confirmLogout;

    async function logout(project) {
        try {
            showToast('Clearing session...', 'success');

            // Clear server-side session
            var resp = await fetch('/api/system/reset', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({action: 'clear-session', project: project})
            });
            var data = await resp.json();

            if (data.success) {
                // Clear client-side state
                localStorage.removeItem('chatRelayCurrentJobId');
                localStorage.removeItem('chatRelayCurrentJobProject');
                localStorage.removeItem('chatRelayCurrentJobTitle');

                // Clear local chat history display
                chatHistory = [];
                var chatPane = document.getElementById('chatPane');
                if (chatPane) {
                    while (chatPane.firstChild) {
                        chatPane.removeChild(chatPane.firstChild);
                    }
                }

                // Update health indicator
                checkHealth();

                showToast('Session cleared for ' + project + '. Next message starts fresh.', 'success');
            } else {
                showToast('Failed to clear session: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (e) {
            showToast('Logout error: ' + e.message, 'error');
        }
    }
    window.logout = logout;

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
                lastShownQuestionHash = null;  // Clear hash so new questions can be shown
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

    async function skipQuestions() {
        if (questionsVoiceActive) {
            stopQuestionsVoice();
        }

        if (!currentJobId) {
            hideQuestionsModal();
            return;
        }

        hideQuestionsModal();
        showAckBanner('Skipping questions - Claude will continue...', false);

        try {
            // Send empty answers to signal skip
            var res = await fetch('/api/chat/answers', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    job_id: currentJobId,
                    answers: {}  // Empty = skipped
                })
            });
            var data = await res.json();

            if (data.status === 'answers_submitted') {
                lastShownQuestionHash = null;  // Clear hash so new questions can be shown
                showAckBanner('Questions skipped - Claude is continuing...', true);
            } else {
                showToast('Failed to skip: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (err) {
            showToast('Error skipping questions: ' + err.message, 'error');
        }
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
    async function handleProjectChange(newProject) {

        // If switching away from a project with an active job, keep it persisted
        // so we can return to it later
        if (currentJobId && currentJobProject) {
            console.log('Switching away from project with active job:', currentJobProject);
            // Job state is already persisted in localStorage, just stop local polling
            if (pollInterval) {
                stopPolling();
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
                    updateQuickMsgButton(); // Ensure quick message button is shown
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
    }

    // Add listeners to both project selects
    document.getElementById('projectSelect').addEventListener('change', function() {
        var newProject = this.value;
        syncProjectSelects(newProject);
        handleProjectChange(newProject);
    });

    var mobileSelect = document.getElementById('projectSelectMobile');
    if (mobileSelect) {
        mobileSelect.addEventListener('change', function() {
            var newProject = this.value;
            syncProjectSelects(newProject);
            handleProjectChange(newProject);
        });
    }

    // ========== JOB HISTORY ==========
    var jobHistoryData = [];

    function openJobHistoryModal() {
        document.getElementById('jobHistoryModal').style.display = 'block';
        // Populate project filter and default to current project
        var projectFilter = document.getElementById('jobHistoryProjectFilter');
        if (projectFilter) {
            var currentProject = document.getElementById('projectSelect') ? document.getElementById('projectSelect').value : '';
            // Clear existing options safely
            while (projectFilter.firstChild) { projectFilter.removeChild(projectFilter.firstChild); }
            var allOpt = document.createElement('option');
            allOpt.value = '';
            allOpt.textContent = 'All Projects';
            projectFilter.appendChild(allOpt);
            var projectSelects = document.getElementById('projectSelect');
            if (projectSelects) {
                Array.from(projectSelects.options).forEach(function(opt) {
                    if (opt.value) {
                        var option = document.createElement('option');
                        option.value = opt.value;
                        option.textContent = opt.value;
                        projectFilter.appendChild(option);
                    }
                });
            }
            // Default to current project so user sees their active project's jobs
            projectFilter.value = currentProject || '';
        }
        loadJobHistory();
    }
    window.openJobHistoryModal = openJobHistoryModal;

    function closeJobHistoryModal() {
        document.getElementById('jobHistoryModal').style.display = 'none';
    }
    window.closeJobHistoryModal = closeJobHistoryModal;

    async function loadJobHistory() {
        var listEl = document.getElementById('jobHistoryList');
        if (!listEl) return;

        listEl.innerHTML = '<div class="job-history-loading">Loading job history...</div>';

        var projectFilter = document.getElementById('jobHistoryProjectFilter');
        var statusFilter = document.getElementById('jobHistoryStatusFilter');
        var project = projectFilter ? projectFilter.value : '';
        var status = statusFilter ? statusFilter.value : '';

        try {
            var url = '/api/jobs/history';
            var params = [];
            if (project) params.push('project=' + encodeURIComponent(project));
            if (status) params.push('status=' + encodeURIComponent(status));
            if (params.length > 0) url += '?' + params.join('&');

            var res = await fetch(url);
            var data = await res.json();

            if (data.success && data.jobs) {
                jobHistoryData = data.jobs;
                renderJobHistory();
            } else {
                listEl.innerHTML = '<div class="job-history-empty">No jobs found</div>';
            }
        } catch (e) {
            console.error('Failed to load job history:', e);
            listEl.innerHTML = '<div class="job-history-error">Failed to load job history</div>';
        }
    }
    window.loadJobHistory = loadJobHistory;

    function renderJobHistory() {
        var listEl = document.getElementById('jobHistoryList');
        if (!listEl) return;

        if (!jobHistoryData || jobHistoryData.length === 0) {
            listEl.innerHTML = '<div class="job-history-empty">No jobs found</div>';
            return;
        }

        var html = '';
        jobHistoryData.forEach(function(job) {
            var statusClass = 'status-' + (job.status || 'pending');
            var statusLabel = job.status || 'pending';
            var timestamp = job.created_at || job.created || job.timestamp || '';
            if (timestamp) {
                try {
                    // Handle Unix timestamps (seconds) - convert to milliseconds for Date
                    var ts = typeof timestamp === 'number' && timestamp < 9999999999 ? timestamp * 1000 : timestamp;
                    var date = new Date(ts);
                    timestamp = date.toLocaleString();
                } catch (e) {
                    // Keep original timestamp
                }
            }
            var messagePreview = job.message || '';
            if (messagePreview.length > 100) {
                messagePreview = messagePreview.substring(0, 100) + '...';
            }
            // Escape HTML
            messagePreview = messagePreview.replace(/</g, '&lt;').replace(/>/g, '&gt;');

            html += '<div class="job-history-item" onclick="selectHistoryJob(\'' + job.id + '\')">';
            html += '<div class="job-history-header">';
            html += '<span class="job-history-project">' + (job.project || 'No Project') + '</span>';
            html += '<span class="job-history-status ' + statusClass + '">' + statusLabel + '</span>';
            html += '</div>';
            html += '<div class="job-history-message">' + messagePreview + '</div>';
            html += '<div class="job-history-time">' + timestamp + '</div>';
            html += '</div>';
        });

        listEl.innerHTML = html;
    }

    async function selectHistoryJob(jobId) {
        if (!jobId) return;

        // Find the job in our cached data
        var job = jobHistoryData.find(function(j) { return j.id === jobId; });
        if (!job) {
            showToast('Job not found', 'error');
            return;
        }

        // Close the modal
        closeJobHistoryModal();

        // If the job has a result, display it in the response area
        if (job.result || job.response) {
            var content = job.result || job.response;

            // Clear existing response area and show the job result
            if (responseArea) {
                responseArea.innerHTML = '';
            }

            // Show a message header with job info
            var header = document.createElement('div');
            header.className = 'message-header';
            header.innerHTML = '<span class="job-history-label">Job from ' + (job.project || 'No Project') + '</span>';
            responseArea.appendChild(header);

            // Add the content
            var contentDiv = document.createElement('div');
            contentDiv.className = 'message-assistant';

            // Parse markdown if we have the function
            if (typeof parseMarkdown === 'function') {
                contentDiv.innerHTML = parseMarkdown(content);
            } else {
                contentDiv.innerHTML = content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            }
            responseArea.appendChild(contentDiv);

            // Highlight code blocks
            responseArea.querySelectorAll('pre code').forEach(function(block) {
                if (window.hljs) {
                    hljs.highlightElement(block);
                }
            });

            showToast('Loaded job result', 'success');
        } else if (job.status === 'pending' || job.status === 'processing') {
            showToast('This job is still ' + job.status, 'info');
        } else {
            showToast('No result available for this job', 'info');
        }
    }
    window.selectHistoryJob = selectHistoryJob;

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

    // Actions Menu Toggle
    function toggleActionsMenu() {
        var menu = document.getElementById('actionsMenu');
        var overlay = document.getElementById('actionsMenuOverlay');
        if (!menu) return;
        if (menu.style.display === 'none') {
            menu.style.display = 'block';
            if (overlay) overlay.style.display = 'block';
        } else {
            menu.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
        }
    }

    // Handle mobile file attachment
    function handleMobileFileAttach(input) {
        if (!input.files || input.files.length === 0) return;

        for (var i = 0; i < input.files.length; i++) {
            var file = input.files[i];
            var reader = new FileReader();

            reader.onload = (function(f) {
                return function(e) {
                    var base64 = e.target.result;
                    // Check if it's an image
                    if (f.type.startsWith('image/')) {
                        attachedImages.push({
                            data: base64,
                            name: f.name,
                            type: f.type
                        });
                        renderAttachments();
                        showToast('Image attached: ' + f.name, 'success');
                    } else if (f.type === 'application/pdf') {
                        attachedPdfs.push({
                            data: base64,
                            name: f.name,
                            type: f.type
                        });
                        renderPdfs();
                        showToast('PDF attached: ' + f.name, 'success');
                    } else {
                        attachedFiles.push({
                            data: base64,
                            name: f.name,
                            type: f.type
                        });
                        renderAttachments();
                        showToast('File attached: ' + f.name, 'success');
                    }
                };
            })(file);

            reader.readAsDataURL(file);
        }
        // Clear input so same file can be attached again
        input.value = '';
    }

    // Expose to global
    window.toggleActionsMenu = toggleActionsMenu;
    window.handleMobileFileAttach = handleMobileFileAttach;

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
            window.autoReadEnabled = false;
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

        // Initialize mobile tabs - default to files tab
        if (window.innerWidth <= 768) {
            switchFileBrowserTab('files');
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
            window.autoReadEnabled = true;
            updateAutoReadButton();
        }

        if (fileBrowserVoiceState.wasRecordingOn && recognition) {
            isRecording = true;
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
            voiceDots.classList.add('active');
            voiceRestartAttempts = 0;
            voiceIsStarting = false;
            var fbDelay = isMobile ? 800 : 300;
            setTimeout(safeStartRecognition, fbDelay);
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

        // Reset mobile tab state
        currentFileBrowserTab = 'files';
    }
    window.closeFileBrowser = closeFileBrowser;

    // Mobile File Browser Tab Switching
    var currentFileBrowserTab = 'files'; // 'files', 'source', 'explain'

    function switchFileBrowserTab(tab) {
        currentFileBrowserTab = tab;

        // Update tab buttons
        var tabs = document.querySelectorAll('.fb-tab');
        tabs.forEach(function(t) {
            t.classList.remove('active');
            if (t.dataset.tab === tab) {
                t.classList.add('active');
            }
        });

        // Get panels
        var fileTreePanel = document.querySelector('.file-tree-panel');
        var editorPanel = document.getElementById('editorPanel');
        var explainPanel = document.getElementById('explainPanel');

        // Remove active class from all
        if (fileTreePanel) fileTreePanel.classList.remove('fb-active');
        if (editorPanel) editorPanel.classList.remove('fb-active');
        if (explainPanel) explainPanel.classList.remove('fb-active');

        // Add active class to selected panel
        switch (tab) {
            case 'files':
                if (fileTreePanel) fileTreePanel.classList.add('fb-active');
                break;
            case 'source':
                if (editorPanel) editorPanel.classList.add('fb-active');
                break;
            case 'explain':
                if (explainPanel) {
                    explainPanel.classList.add('fb-active');
                    // Also make sure explainPanel is visible (it might be display:none from desktop)
                    explainPanel.style.display = 'flex';
                }
                break;
        }
    }
    window.switchFileBrowserTab = switchFileBrowserTab;

    // Initialize file browser tabs on mobile - default to files tab
    function initFileBrowserMobileTabs() {
        if (window.innerWidth <= 768) {
            switchFileBrowserTab('files');
        }
    }

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

                // On mobile, auto-switch to Source tab when file is opened
                if (window.innerWidth <= 768) {
                    switchFileBrowserTab('source');
                }
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

        // On mobile, switch to Explain tab
        if (window.innerWidth <= 768) {
            switchFileBrowserTab('explain');
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

        // Route to Piper if selected (local neural TTS)
        if (voiceSettings.engine === 'piper') {
            var piperVoice = voiceSettings.axionPiperVoice || voiceSettings.piperVoice || 'amy';
            speakWithPiper(chunk, piperVoice, function() {
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
                isRecording = true;
                voiceBtn.classList.add('recording');
                voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                voiceDots.classList.add('active');
                voiceRestartAttempts = 0;
                voiceIsStarting = false;
                setTimeout(safeStartRecognition, isMobile ? 600 : 200);
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
                        isRecording = true;
                        voiceBtn.classList.add('recording');
                        voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                        voiceDots.classList.add('active');
                        voiceRestartAttempts = 0;
                        voiceIsStarting = false;
                        setTimeout(safeStartRecognition, isMobile ? 600 : 200);
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
                        isRecording = true;
                        voiceBtn.classList.add('recording');
                        voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                        voiceDots.classList.add('active');
                        voiceRestartAttempts = 0;
                        voiceIsStarting = false;
                        setTimeout(safeStartRecognition, isMobile ? 600 : 200);
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
                        voiceBtn.classList.add('recording');
                        voiceBtn.textContent = voiceCommandsOnly ? '🎯' : '⏹';
                        voiceDots.classList.add('active');
                        voiceRestartAttempts = 0;
                        voiceIsStarting = false;
                        setTimeout(safeStartRecognition, isMobile ? 600 : 200);
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

    loadUsers();
    loadProjects();
    loadModelPreference();  // Load saved model selection
    initSidebar();
    initHistoryMode();
    checkHealth();

    // Initialize live box voice mode based on auto-read setting
    setTimeout(updateLiveBoxVoiceMode, 100);

    // Initialize quick message button visibility
    setTimeout(updateQuickMsgButton, 200);

    // Restore voice recording state from localStorage
    if (SR && localStorage.getItem('voiceEnabled') === 'true') {
        isRecording = true;
        voiceBtn.classList.add('recording');
        voiceBtn.textContent = '⏹';
        voiceDots.classList.add('active');
        // Delay start - mobile needs longer for page to be fully interactive
        voiceRestartAttempts = 0;
        voiceIsStarting = false;
        var initDelay = isMobile ? 1000 : 500;
        setTimeout(safeStartRecognition, initDelay);
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
                    updateQuickMsgButton(); // Show quick message button for reconnected job

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

    // Initialize skills panel search
    var skillsSearchInput = document.getElementById('skillsSearch');
    if (skillsSearchInput) {
        skillsSearchInput.addEventListener('input', filterSkills);
    }
})();

// ===== SKILLS PANEL FUNCTIONS =====
var selectedSkills = [];
var activeSkills = [];

function toggleSkillsPanel() {
    var panel = document.getElementById('skillsPanel');
    var overlay = document.getElementById('skillsOverlay');
    var btn = document.getElementById('skillsBtn');
    if (!panel) return;

    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'flex';
        if (overlay) overlay.style.display = 'block';
        if (btn) btn.classList.add('active');
        // Focus search
        var search = document.getElementById('skillsSearch');
        if (search) search.focus();
        // Sync card states with selected skills
        updateCardStates();
    } else {
        panel.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

function toggleSkill(skill) {
    var idx = selectedSkills.indexOf(skill);
    if (idx >= 0) {
        // Remove skill
        selectedSkills.splice(idx, 1);
    } else {
        // Add skill
        selectedSkills.push(skill);
    }
    updateCardStates();
    updateSelectedSkillsDisplay();
    updateInputWithSkills();
}

function updateCardStates() {
    var cards = document.querySelectorAll('.skill-card');
    cards.forEach(function(card) {
        var skill = card.getAttribute('data-skill');
        if (selectedSkills.includes(skill)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

function updateSelectedSkillsDisplay() {
    var area = document.getElementById('selectedSkillsArea');
    var list = document.getElementById('selectedSkillsList');
    if (!area || !list) return;

    if (selectedSkills.length === 0) {
        area.style.display = 'none';
        return;
    }

    area.style.display = 'block';

    // Clear and rebuild
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    selectedSkills.forEach(function(skill) {
        var tag = document.createElement('span');
        tag.className = 'selected-skill-tag';
        tag.onclick = function() { toggleSkill(skill); };

        var text = document.createTextNode(skill + ' ');
        tag.appendChild(text);

        var removeX = document.createElement('span');
        removeX.className = 'remove-x';
        removeX.textContent = '\u00D7';
        tag.appendChild(removeX);

        list.appendChild(tag);
    });
}

function updateInputWithSkills() {
    var input = document.getElementById('inputArea');
    if (!input) return;

    // Get current text without skill commands
    var currentText = input.value;
    // Remove all existing skill commands
    currentText = currentText.replace(/\/[a-zA-Z_:-]+\s*/g, '').trim();

    // Prepend selected skills
    if (selectedSkills.length > 0) {
        input.value = selectedSkills.join(' ') + ' ' + currentText;
    } else {
        input.value = currentText;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearAllSkills() {
    selectedSkills = [];
    updateCardStates();
    updateSelectedSkillsDisplay();
    updateInputWithSkills();
}

function removeSkillFromSelection(skill) {
    toggleSkill(skill);
}

function showActiveSkills(skills) {
    activeSkills = skills;
    var bar = document.getElementById('activeSkillsBar');
    var list = document.getElementById('activeSkillsList');
    if (!bar || !list) return;

    if (!skills || skills.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';

    // Clear and rebuild
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    skills.forEach(function(skill) {
        var tag = document.createElement('span');
        tag.className = 'active-skill-tag';

        var spinner = document.createElement('span');
        spinner.className = 'active-skill-spinner';
        tag.appendChild(spinner);

        var text = document.createTextNode(' ' + skill);
        tag.appendChild(text);

        list.appendChild(tag);
    });
}

function clearActiveSkills() {
    activeSkills = [];
    var bar = document.getElementById('activeSkillsBar');
    if (bar) bar.style.display = 'none';
}

function filterSkills(e) {
    var query = e.target.value.toLowerCase();
    var cards = document.querySelectorAll('.skill-card');
    var sections = document.querySelectorAll('.skills-section');

    cards.forEach(function(card) {
        var name = card.querySelector('.skill-card-name');
        var desc = card.querySelector('.skill-card-desc');
        var text = (name ? name.textContent : '') + ' ' + (desc ? desc.textContent : '');
        if (text.toLowerCase().includes(query)) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });

    // Hide empty sections
    sections.forEach(function(section) {
        var visibleCards = section.querySelectorAll('.skill-card:not(.hidden)');
        if (visibleCards.length === 0) {
            section.classList.add('hidden');
        } else {
            section.classList.remove('hidden');
        }
    });
}

// Detect skill commands in message text
function detectSkillsInMessage(text) {
    var matches = text.match(/\/[a-zA-Z_:-]+/g);
    return matches || [];
}

// Call this when a message is sent to show active skills
function onMessageSent(text) {
    var skills = detectSkillsInMessage(text);
    if (skills.length > 0) {
        showActiveSkills(skills);
    }
    // Clear selected skills after sending
    selectedSkills = [];
    updateCardStates();
    updateSelectedSkillsDisplay();
}

// Call this when response is complete to clear active skills
function onResponseComplete() {
    clearActiveSkills();
}

// ===== SKILL INFO MODAL FUNCTIONS =====
var currentSkillInfo = null;

// Initialize skill info buttons on all skill cards
function initSkillInfoButtons() {
    var cards = document.querySelectorAll('.skill-card');
    cards.forEach(function(card) {
        // Skip if already has info button
        if (card.querySelector('.skill-card-info-btn')) return;

        var skill = card.getAttribute('data-skill');
        var iconEl = card.querySelector('.skill-card-icon');
        var icon = iconEl ? iconEl.textContent : '';
        var skillName = skill ? skill.replace(/^\//, '') : '';

        var btn = document.createElement('button');
        btn.className = 'skill-card-info-btn';
        btn.title = 'View skill details';
        btn.innerHTML = '?'; // question mark - clearer and more visible
        btn.onclick = function(e) {
            e.stopPropagation();
            showSkillInfo(skillName, icon);
        };

        // Insert before the check element
        var checkEl = card.querySelector('.skill-card-check');
        if (checkEl) {
            card.insertBefore(btn, checkEl);
        } else {
            card.appendChild(btn);
        }
    });
}

function showSkillInfo(skillName, icon) {
    var modal = document.getElementById('skillInfoModal');
    var overlay = document.getElementById('skillInfoOverlay');
    var loading = document.getElementById('skillInfoLoading');
    var body = document.getElementById('skillInfoBody');

    if (!modal || !overlay) return;

    // Reset state
    currentSkillInfo = { name: skillName, icon: icon };
    document.getElementById('skillInfoName').textContent = '/' + skillName;
    document.getElementById('skillInfoIcon').textContent = icon || '\u2699';

    // Show modal with loading state
    loading.style.display = 'flex';
    body.style.display = 'none';
    modal.style.display = 'flex';
    overlay.style.display = 'block';

    // Fetch skill info from API
    fetch('/api/skills/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: skillName })
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        return response.json();
    })
    .then(function(data) {
        if (data.error) {
            document.getElementById('skillInfoDesc').textContent = 'Error: ' + data.error;
            loading.style.display = 'none';
            body.style.display = 'block';
            return;
        }

        var skill = data.skill || {};
        currentSkillInfo = Object.assign(currentSkillInfo, skill);

        // Populate description
        document.getElementById('skillInfoDesc').textContent = skill.description || 'No description available.';

        // Populate overview if available
        var overviewSection = document.getElementById('skillInfoOverviewSection');
        if (skill.overview) {
            document.getElementById('skillInfoOverview').textContent = skill.overview;
            overviewSection.style.display = 'block';
        } else {
            overviewSection.style.display = 'none';
        }

        // Populate usage
        document.getElementById('skillInfoUsage').textContent = skill.usage || '/' + skillName;

        // Populate examples if available
        var examplesSection = document.getElementById('skillInfoExamplesSection');
        if (skill.examples || skill.usage_examples) {
            document.getElementById('skillInfoExamples').textContent = skill.examples || skill.usage_examples;
            examplesSection.style.display = 'block';
        } else {
            examplesSection.style.display = 'none';
        }

        // Populate full content if available
        var contentSection = document.getElementById('skillInfoContentSection');
        if (skill.content) {
            // Truncate very long content
            var content = skill.content;
            if (content.length > 3000) {
                content = content.substring(0, 3000) + '\n\n... (content truncated)';
            }
            document.getElementById('skillInfoFullContent').textContent = content;
            contentSection.style.display = 'block';
        } else {
            contentSection.style.display = 'none';
        }

        loading.style.display = 'none';
        body.style.display = 'block';
    })
    .catch(function(error) {
        console.error('Error fetching skill info:', error);
        // Show skill name as fallback info
        document.getElementById('skillInfoDesc').textContent =
            'Use this skill by typing /' + skillName + ' in your message.\n\n' +
            '(Detailed documentation unavailable - server may need restart)';
        document.getElementById('skillInfoUsage').textContent = '/' + skillName + ' [your task description]';
        loading.style.display = 'none';
        body.style.display = 'block';
    });
}

function closeSkillInfo() {
    var modal = document.getElementById('skillInfoModal');
    var overlay = document.getElementById('skillInfoOverlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    currentSkillInfo = null;
}

function useSkillFromInfo() {
    if (!currentSkillInfo) return;

    var skillCmd = '/' + currentSkillInfo.name;

    // Add to selected skills and update input
    if (!selectedSkills.includes(skillCmd)) {
        selectedSkills.push(skillCmd);
        updateCardStates();
        updateSelectedSkillsDisplay();
        updateInputWithSkills();
    }

    // Close the info modal
    closeSkillInfo();

    // Focus the input
    var input = document.getElementById('inputArea');
    if (input) input.focus();
}

function copySkillCommand() {
    if (!currentSkillInfo) return;

    var cmd = '/' + currentSkillInfo.name;
    navigator.clipboard.writeText(cmd).then(function() {
        // Show brief feedback
        var btn = document.querySelector('.skill-info-copy-btn');
        if (btn) {
            var originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.color = 'var(--green)';
            setTimeout(function() {
                btn.textContent = originalText;
                btn.style.color = '';
            }, 1500);
        }
    });
}

// Initialize skill info buttons when skills panel is opened
var originalToggleSkillsPanel = toggleSkillsPanel;
toggleSkillsPanel = function() {
    originalToggleSkillsPanel();
    // Initialize buttons after panel is shown
    setTimeout(initSkillInfoButtons, 50);
};

// Also run on page load in case panel is already visible
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initSkillInfoButtons, 100);
});

// Close skill info modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        var modal = document.getElementById('skillInfoModal');
        if (modal && modal.style.display !== 'none') {
            closeSkillInfo();
            e.preventDefault();
        }
    }
});

// ===== NEW PROJECT MODAL FUNCTIONS =====

function openNewProjectModal() {
    var modal = document.getElementById('newProjectModal');
    if (modal) {
        modal.style.display = 'flex';
        // Focus the input
        var input = document.getElementById('newProjectName');
        if (input) {
            input.value = '';
            input.focus();
        }
        // Reset status
        var status = document.getElementById('newProjectStatus');
        if (status) {
            status.className = 'new-project-status';
            status.textContent = '';
        }
    }
}
window.openNewProjectModal = openNewProjectModal;

function closeNewProjectModal() {
    var modal = document.getElementById('newProjectModal');
    if (modal) {
        modal.style.display = 'none';
    }
}
window.closeNewProjectModal = closeNewProjectModal;

async function createNewProject() {
    var nameInput = document.getElementById('newProjectName');
    var initGit = document.getElementById('newProjectInitGit');
    var copyTemplate = document.getElementById('newProjectCopyTemplate');
    var status = document.getElementById('newProjectStatus');

    var name = nameInput ? nameInput.value.trim().toLowerCase() : '';

    if (!name) {
        status.className = 'new-project-status error';
        status.textContent = 'Please enter a project name';
        return;
    }

    // Show loading state
    status.className = 'new-project-status loading';
    status.textContent = 'Creating project...';

    try {
        var response = await fetch('/api/project/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                user: currentUser,
                init_git: initGit ? initGit.checked : true,
                copy_template: copyTemplate ? copyTemplate.checked : true
            })
        });

        var data = await response.json();

        if (data.success) {
            status.className = 'new-project-status success';
            status.textContent = 'Project "' + name + '" created successfully!';

            // Refresh project list and select new project
            setTimeout(async function() {
                // Fetch fresh project list
                try {
                    // Reload projects (handles new object format and user filtering)
                    await loadProjects();

                    // Find the new project path and select it
                    var newProjectPath = currentUser + '/' + name;
                    syncProjectSelects(newProjectPath);

                    // Save to localStorage and trigger change
                    localStorage.setItem('chatRelayProject', newProjectPath);
                    var mainSelect = document.getElementById('projectSelect');
                    if (mainSelect) {
                        mainSelect.dispatchEvent(new Event('change'));
                    }
                } catch (e) {
                    console.error('Failed to refresh projects:', e);
                }
                closeNewProjectModal();
            }, 1000);
        } else {
            status.className = 'new-project-status error';
            status.textContent = data.error || 'Failed to create project';
        }
    } catch (e) {
        status.className = 'new-project-status error';
        status.textContent = 'Error: ' + e.message;
    }
}
window.createNewProject = createNewProject;

// Close new project modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        var modal = document.getElementById('newProjectModal');
        if (modal && modal.style.display !== 'none') {
            closeNewProjectModal();
            e.preventDefault();
        }
        var deleteModal = document.getElementById('deleteProjectModal');
        if (deleteModal && deleteModal.style.display !== 'none') {
            closeDeleteProjectModal();
            e.preventDefault();
        }
    }
});

// ===== DELETE PROJECT MODAL FUNCTIONS =====

var deleteProjectTarget = '';

function openDeleteProjectModal() {
    var project = document.getElementById('projectSelect').value;
    if (!project) {
        showToast('Please select a project to delete', 'error');
        return;
    }

    deleteProjectTarget = project;
    var modal = document.getElementById('deleteProjectModal');
    var projectNameSpan = document.getElementById('deleteProjectName');
    var confirmInput = document.getElementById('deleteProjectConfirmInput');
    var githubCheckbox = document.getElementById('deleteFromGitHub');
    var githubInput = document.getElementById('deleteGitHubConfirmInput');
    var confirmBtn = document.getElementById('confirmDeleteBtn');
    var status = document.getElementById('deleteProjectStatus');

    if (modal) {
        modal.style.display = 'flex';
        if (projectNameSpan) projectNameSpan.textContent = project;
        if (confirmInput) {
            confirmInput.value = '';
            confirmInput.focus();
        }
        if (githubCheckbox) githubCheckbox.checked = false;
        if (githubInput) githubInput.style.display = 'none';
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
            confirmBtn.style.cursor = 'not-allowed';
        }
        if (status) status.innerHTML = '';
    }
}
window.openDeleteProjectModal = openDeleteProjectModal;

function closeDeleteProjectModal() {
    var modal = document.getElementById('deleteProjectModal');
    if (modal) {
        modal.style.display = 'none';
    }
    deleteProjectTarget = '';
}
window.closeDeleteProjectModal = closeDeleteProjectModal;

// Validation for delete confirmation
document.addEventListener('DOMContentLoaded', function() {
    var confirmInput = document.getElementById('deleteProjectConfirmInput');
    var githubCheckbox = document.getElementById('deleteFromGitHub');
    var githubInput = document.getElementById('deleteGitHubConfirmInput');

    if (confirmInput) {
        confirmInput.addEventListener('input', validateDeleteInputs);
    }
    if (githubCheckbox) {
        githubCheckbox.addEventListener('change', function() {
            if (githubInput) {
                githubInput.style.display = this.checked ? 'block' : 'none';
                if (!this.checked) githubInput.value = '';
            }
            validateDeleteInputs();
        });
    }
    if (githubInput) {
        githubInput.addEventListener('input', validateDeleteInputs);
    }
});

function validateDeleteInputs() {
    var confirmInput = document.getElementById('deleteProjectConfirmInput');
    var githubCheckbox = document.getElementById('deleteFromGitHub');
    var githubInput = document.getElementById('deleteGitHubConfirmInput');
    var confirmBtn = document.getElementById('confirmDeleteBtn');

    if (!confirmBtn) return;

    var nameMatches = confirmInput && confirmInput.value.trim() === deleteProjectTarget;
    var githubValid = !githubCheckbox || !githubCheckbox.checked ||
                      (githubInput && githubInput.value.trim().toLowerCase() === 'delete');

    var canDelete = nameMatches && githubValid;

    confirmBtn.disabled = !canDelete;
    confirmBtn.style.opacity = canDelete ? '1' : '0.5';
    confirmBtn.style.cursor = canDelete ? 'pointer' : 'not-allowed';
}

async function confirmDeleteProject() {
    var confirmInput = document.getElementById('deleteProjectConfirmInput');
    var githubCheckbox = document.getElementById('deleteFromGitHub');
    var githubInput = document.getElementById('deleteGitHubConfirmInput');
    var status = document.getElementById('deleteProjectStatus');
    var confirmBtn = document.getElementById('confirmDeleteBtn');

    // Validate again
    if (!confirmInput || confirmInput.value.trim() !== deleteProjectTarget) {
        if (status) {
            status.innerHTML = '<span style="color:var(--error);">Project name does not match</span>';
        }
        return;
    }

    var deleteFromGitHub = githubCheckbox && githubCheckbox.checked &&
                           githubInput && githubInput.value.trim().toLowerCase() === 'delete';

    // Show loading
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting...';
    }
    if (status) {
        status.innerHTML = '<span style="color:var(--text-secondary);">Deleting project...</span>';
    }

    try {
        var response = await fetch('/api/project/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: deleteProjectTarget,
                delete_from_github: deleteFromGitHub
            })
        });

        var data = await response.json();

        if (data.success) {
            if (status) {
                status.innerHTML = '<span style="color:var(--success);">Project deleted successfully!</span>';
            }
            showToast('Project "' + deleteProjectTarget + '" deleted', 'success');

            // Refresh project list
            setTimeout(async function() {
                try {
                    var res = await fetch('/api/projects');
                    var projectData = await res.json();
                    var selects = [
                        document.getElementById('projectSelect'),
                        document.getElementById('projectSelectMobile')
                    ].filter(Boolean);

                    selects.forEach(function(select) {
                        // Clear existing options
                        while (select.firstChild) {
                            select.removeChild(select.firstChild);
                        }
                        // Add default option
                        var defaultOpt = document.createElement('option');
                        defaultOpt.value = '';
                        defaultOpt.textContent = 'No Project';
                        select.appendChild(defaultOpt);
                        // Add project options
                        projectData.projects.forEach(function(p) {
                            var opt = document.createElement('option');
                            opt.value = p;
                            opt.textContent = p;
                            select.appendChild(opt);
                        });
                        // Select "No Project"
                        select.value = '';
                    });

                    localStorage.setItem('chatRelayProject', '');
                } catch (e) {
                    console.error('Failed to refresh projects:', e);
                }
                closeDeleteProjectModal();
            }, 1000);
        } else {
            if (status) {
                status.innerHTML = '<span style="color:var(--error);">' + (data.error || 'Failed to delete project') + '</span>';
            }
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Delete Project';
            }
        }
    } catch (e) {
        if (status) {
            status.innerHTML = '<span style="color:var(--error);">Error: ' + e.message + '</span>';
        }
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Delete Project';
        }
    }
}
window.confirmDeleteProject = confirmDeleteProject;
