// script.js

// Import Firebase modules using CDN URLs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, deleteDoc, serverTimestamp, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Marked.js is globally available because it's loaded via CDN in index.html
const marked = window.marked; // Access the global 'marked' object

// =======================================================================================
// >>>>>>>>>>>>>>>>> IMPORTANT SECURITY WARNING FOR MARKED.JS SANITIZATION <<<<<<<<<<<<<<<<<<
// Setting 'sanitize: false' allows raw HTML to be rendered from Markdown.
// This is necessary for <u> tags to work, as they are not standard Markdown.
// HOWEVER, this also means that any malicious HTML (like <script> tags) submitted by a user
// will also be rendered, creating a Cross-Site Scripting (XSS) vulnerability.
// For a private, trusted group like a math club, this risk might be acceptable.
// For public-facing applications, a more robust HTML sanitization library (e.g., DOMPurify)
// should be used in conjunction with marked.js, or a custom marked.js extension for <u>.
// =======================================================================================
marked.setOptions({
    gfm: true,     // Enable GitHub Flavored Markdown
    breaks: true,  // Enable GFM line breaks (converts single newlines to <br/>)
    sanitize: false // DANGER: Allows raw HTML. Use with caution!
});


// =======================================================================================
// >>>>>>>>>>>>>>>>> IMPORTANT: YOUR FIREBASE CONFIGURATION HERE <<<<<<<<<<<<<<<<<<
// Replace these placeholder values with the actual `firebaseConfig` object
// you obtained from your Firebase project settings in the Firebase Console.
// =======================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBkFwqpkhoXj_bxMjxKvnvA3vlPGrJ_Sps",
  authDomain: "mathclubideas.firebaseapp.com",
  projectId: "mathclubideas",
  storageBucket: "mathclubideas.firebasestorage.app",
  messagingSenderId: "513454624671",
  appId: "1:513454624671:web:09af65e85abe3048caf7aa"
};


// =======================================================================================
// >>>>>>>>>>>>>>>>> UNIQUE IDENTIFIER FOR YOUR APP'S DATA IN FIRESTORE <<<<<<<<<<<<<<<<<
// This helps organize your data if you use the same Firebase project for multiple apps.
// Data path will be: `artifacts/YOUR_CUSTOM_APP_ID/public/data/ideas`
// =======================================================================================
const YOUR_CUSTOM_APP_ID = "math-club-ideas-board-v8-design-refresh"; // Keep this ID consistent with your data

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null; // To store the anonymous user's ID
let currentSortOption = 'recent'; // Default sort option
let allIdeas = []; // <<< NEW: To store all fetched ideas for client-side sorting

// --- DOM Elements ---
const ideasList = document.getElementById('ideasList');
const ideaForm = document.getElementById('ideaForm');
const ideaTextInput = document.getElementById('ideaText');
const formMessage = document.getElementById('formMessage');
const userIdDisplay = document.getElementById('userIdDisplay');
const loadingOverlay = document.getElementById('loadingOverlay');
const errorOverlay = document.getElementById('errorOverlay');
const errorMessageText = document.getElementById('errorMessageText');

// Formatting Buttons (for submission form)
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');
const latexBtn = document.getElementById('latexBtn'); // New LaTeX button

// New Attribute Inputs
const submitterNameInput = document.getElementById('submitterName'); // New name input
const memberCountInput = document.getElementById('memberCount');
const timeConsumingHoursInput = document.getElementById('timeConsumingHours');
const timeToMakeDaysInput = document.getElementById('timeToMakeDays');
const requiresFundsInput = document.getElementById('requiresFunds');

// Sort Options Dropdown
const sortOptionsDropdown = document.getElementById('sortOptions');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
let ideaToDeleteId = null; // Stores the ID of the idea currently selected for deletion


// --- Firebase Initialization and Authentication ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        userIdDisplay.textContent = currentUserId;
        loadingOverlay.classList.add('hidden');
        listenForIdeas(); // Start listening for ideas only after auth
    } else {
        try {
            await signInAnonymously(auth);
        } catch (e) {
            console.error("Error signing in anonymously:", e);
            errorMessageText.textContent = "Failed to authenticate. Please ensure Anonymous Auth is enabled in your Firebase project.";
            errorOverlay.classList.remove('hidden');
            loadingOverlay.classList.add('hidden');
        }
    }
}, (error) => {
    console.error("Auth state change error:", error);
    errorMessageText.textContent = "Authentication error. Please check your Firebase setup.";
    errorOverlay.classList.remove('hidden');
    loadingOverlay.classList.add('hidden');
});

// --- Idea Submission Handler ---
ideaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ideaContent = ideaTextInput.value.trim();
    
    // Get new attribute values, converting to numbers or boolean
    const submitterName = submitterNameInput.value.trim() || 'Anonymous';
    const memberCount = parseInt(memberCountInput.value) || 0;
    const timeConsumingHours = parseInt(timeConsumingHoursInput.value) || 0;
    const timeToMakeDays = parseInt(timeToMakeDaysInput.value) || 0;
    const requiresFunds = requiresFundsInput.checked;

    if (!ideaContent) {
        displayFormMessage('Idea cannot be empty!', 'text-red-600');
        return;
    }
    if (!db || !currentUserId) {
        displayFormMessage('App not ready. Please wait for authentication.', 'text-red-600');
        return;
    }

    try {
        const ideasCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`);
        await addDoc(ideasCollectionRef, {
            idea: ideaContent,
            upvotes: 0,
            downvotes: 0,
            createdAt: serverTimestamp(),
            votedBy: {
                up: [],
                down: []
            },
            // Add new attributes
            submitterName: submitterName, // Store submitter's name
            memberCount: memberCount,
            timeConsumingHours: timeConsumingHours,
            timeToMakeDays: timeToMakeDays,
            requiresFunds: requiresFunds,
            submittedBy: currentUserId // Store the user ID of the submitter for owner-only features
        });
        ideaTextInput.value = ''; // Clear input
        submitterNameInput.value = ''; // Clear name input
        memberCountInput.value = ''; // Clear new inputs
        timeConsumingHoursInput.value = '';
        timeToMakeDaysInput.value = '';
        requiresFundsInput.checked = false;
        displayFormMessage('Idea submitted successfully!', 'text-green-600');
    } catch (error) {
        console.error("Error adding document: ", error);
        displayFormMessage('Failed to submit idea. Check console for details.', 'text-red-600');
    }
});

function displayFormMessage(msg, colorClass) {
    formMessage.textContent = msg;
    formMessage.className = `mt-5 text-center text-md font-medium ${colorClass}`;
    setTimeout(() => {
        formMessage.textContent = '';
        formMessage.className = '';
    }, 3000);
}

// --- Formatting Button Handlers (for submission form) ---
function applyFormatting(syntaxBefore, syntaxAfter, textareaElement) {
    const textarea = textareaElement || ideaTextInput; // Use provided textarea or default
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const newText = textarea.value.substring(0, start) + 
                    syntaxBefore + selectedText + syntaxAfter + 
                    textarea.value.substring(end);
    textarea.value = newText;
    
    if (selectedText.length === 0) {
        textarea.selectionStart = start + syntaxBefore.length;
        textarea.selectionEnd = start + syntaxBefore.length;
    } else {
        textarea.selectionStart = start;
        textarea.selectionEnd = start + syntaxBefore.length + selectedText.length + syntaxAfter.length;
    }
    textarea.focus();
}

boldBtn.addEventListener('click', () => applyFormatting('**', '**', ideaTextInput));
italicBtn.addEventListener('click', () => applyFormatting('*', '*', ideaTextInput));
underlineBtn.addEventListener('click', () => applyFormatting('<u>', '</u>', ideaTextInput));
latexBtn.addEventListener('click', () => applyFormatting('$$', '$$', ideaTextInput)); // LaTeX formatting

// --- Sort Options Handler ---
sortOptionsDropdown.addEventListener('change', (e) => {
    currentSortOption = e.target.value;
    applyAndRenderSorting(); // <<< NEW: Call this function to re-sort and render
});


// --- Real-time Ideas Listener ---
function listenForIdeas() {
    const ideasCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`);
    const q = query(ideasCollectionRef);

    onSnapshot(q, (snapshot) => {
        allIdeas = snapshot.docs.map(doc => ({ // <<< Store fetched ideas in allIdeas
            id: doc.id,
            ...doc.data()
        }));
        applyAndRenderSorting(); // <<< Call this function when new data arrives
    }, (error) => {
        console.error("Error fetching ideas:", error);
        ideasList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400 text-lg">Failed to load ideas. Please refresh and check your browser console.</p>`;
    });
}

// --- NEW: Function to apply sorting and render ideas ---
function applyAndRenderSorting() {
    // Create a mutable copy of allIdeas to sort
    let sortedIdeas = [...allIdeas]; 

    sortedIdeas.sort((a, b) => {
        const valA = (value) => (value === undefined || value === null ? Infinity : value); // Handle undefined/null for sorting numbers
        const valB = (value) => (value === undefined || value === null ? Infinity : value);

        switch (currentSortOption) {
            case 'recent':
                // Newest first (descending timestamp)
                return (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0);
            case 'likes':
                // Most liked (net votes descending)
                return (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes);
            case 'memberCountAsc':
                // Least members needed (ascending)
                return valA(a.memberCount) - valB(b.memberCount);
            case 'timeConsumingHoursAsc':
                // Least time consuming hours (ascending)
                return valA(a.timeConsumingHours) - valB(b.timeConsumingHours);
            case 'timeToMakeDaysAsc':
                // Least time to make days (ascending)
                return valA(a.timeToMakeDays) - valB(b.timeToMakeDays);
            case 'requiresFundsAsc':
                // Requires funds (false first, then true)
                // False (0) comes before True (1)
                return (a.requiresFunds ? 1 : 0) - (b.requiresFunds ? 1 : 0);
            default:
                return (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0); // Default to recent
        }
    });

    renderIdeas(sortedIdeas); // Render the sorted ideas
}


// --- Render Ideas to DOM ---
function renderIdeas(ideasToRender) { // Renamed parameter for clarity
    ideasList.innerHTML = '';
    if (ideasToRender.length === 0) {
        ideasList.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 text-lg">No ideas submitted yet. Be the first!</p>`;
        return;
    }

    ideasToRender.forEach(idea => {
        const ideaCard = createIdeaCard(idea);
        ideasList.appendChild(ideaCard);
    });
    
    // Process LaTeX after rendering all ideas
    setTimeout(() => {
        if (window.MathJax) {
            window.MathJax.typesetPromise && window.MathJax.typesetPromise();
        }
    }, 100);
}

// --- Create Single Idea Card DOM Element ---
function createIdeaCard(idea) {
    const cardDiv = document.createElement('div');
    // Enhanced card styling: more pronounced shadow, subtle border
    cardDiv.className = "flex items-start bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-200 dark:border-gray-700 transform transition duration-300 hover:scale-[1.01] hover:shadow-xl relative";

    const voteContainer = document.createElement('div');
    voteContainer.className = "flex flex-col items-center mr-6 min-w-[50px] flex-shrink-0";

    const upvoteButton = document.createElement('button');
    upvoteButton.className = `
        p-3 rounded-full transition duration-200 ease-in-out
        ${idea.votedBy?.up?.includes(currentUserId)
            ? 'bg-blue-600 text-white shadow-lg transform scale-110' // Active state: more vibrant blue, larger scale
            : 'bg-gray-100 hover:bg-blue-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400' // Inactive state: subtle background, muted icon, vibrant hover
        }
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
        active:scale-95 /* Click feedback */
    `;
    upvoteButton.setAttribute('aria-label', 'Upvote');
    upvoteButton.innerHTML = `<svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 7l-6 6h12z"/></svg>`;
    upvoteButton.addEventListener('click', () => handleVote(idea.id, 'upvote', idea));

    const netVotes = idea.upvotes - idea.downvotes;
    const voteCountSpan = document.createElement('span');
    voteCountSpan.className = `font-bold text-2xl my-2 ${netVotes > 0 ? 'text-green-600 dark:text-green-400' : netVotes < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`;
    voteCountSpan.textContent = netVotes;

    const downvoteButton = document.createElement('button');
    downvoteButton.className = `
        p-3 rounded-full transition duration-200 ease-in-out
        ${idea.votedBy?.down?.includes(currentUserId)
            ? 'bg-red-600 text-white shadow-lg transform scale-110' // Active state: more vibrant red, larger scale
            : 'bg-gray-100 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400' // Inactive state: subtle background, muted icon, vibrant hover
        }
        focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
        active:scale-95
    `;
    downvoteButton.setAttribute('aria-label', 'Downvote');
    downvoteButton.innerHTML = `<svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 17l6-6H6z"/></svg>`;
    downvoteButton.addEventListener('click', () => handleVote(idea.id, 'downvote', idea));

    voteContainer.appendChild(upvoteButton);
    voteContainer.appendChild(voteCountSpan);
    voteContainer.appendChild(downvoteButton);

    cardDiv.appendChild(voteContainer);

    // --- Content Wrapper: This will toggle between display and edit modes ---
    const contentWrapper = document.createElement('div');
    contentWrapper.className = "flex-grow";
    cardDiv.appendChild(contentWrapper);

    // --- Render Display View ---
    const renderDisplayView = (ideaData) => {
        contentWrapper.innerHTML = ''; // Clear previous content

        // Display submitter name if available
        if (ideaData.submitterName && ideaData.submitterName !== 'Anonymous') {
            const nameDiv = document.createElement('div');
            nameDiv.className = "text-sm text-gray-600 dark:text-gray-400 mb-2";
            nameDiv.innerHTML = `<span class="font-semibold">Submitted by:</span> ${ideaData.submitterName}`;
            contentWrapper.appendChild(nameDiv);
        }

        const ideaContentDiv = document.createElement('div');
        ideaContentDiv.className = "text-gray-800 dark:text-gray-100 text-lg leading-relaxed mb-3 math-display";
        ideaContentDiv.innerHTML = marked.parse(ideaData.idea || ''); 
        contentWrapper.appendChild(ideaContentDiv);

        // Display attributes
        const attributesDiv = document.createElement('div');
        attributesDiv.className = "text-sm text-gray-600 dark:text-gray-300 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1";
        
        const addAttribute = (label, value, unit = '') => {
            if (value !== undefined && value !== null && value !== 0 && value !== false) {
                const p = document.createElement('p');
                p.className = "flex items-center";
                p.innerHTML = `<span class="font-semibold text-gray-700 dark:text-gray-200 mr-2">${label}:</span> ${value}${unit}`;
                attributesDiv.appendChild(p);
            }
        };

        addAttribute('Members', ideaData.memberCount);
        addAttribute('Time (Hrs)', ideaData.timeConsumingHours, ' hrs');
        addAttribute('Setup (Days)', ideaData.timeToMakeDays, ' days');
        if (ideaData.requiresFunds !== undefined) {
            const p = document.createElement('p');
            p.className = "flex items-center";
            p.innerHTML = `<span class="font-semibold text-gray-700 dark:text-gray-200 mr-2">Requires Funds:</span> <span class="${ideaData.requiresFunds ? 'text-red-500 font-bold' : 'text-green-500 font-bold'}">${ideaData.requiresFunds ? 'Yes' : 'No'}</span>`;
            attributesDiv.appendChild(p);
        }
        
        if (attributesDiv.children.length > 0) {
            contentWrapper.appendChild(attributesDiv);
        }
        
        // Add timestamp
        if (ideaData.createdAt) {
            const timestampDiv = document.createElement('div');
            timestampDiv.className = "text-xs text-gray-500 dark:text-gray-500 mt-3";
            timestampDiv.textContent = `Submitted: ${ideaData.createdAt.toDate().toLocaleString()}`;
            contentWrapper.appendChild(timestampDiv);
        }
    };

    // --- Render Edit View ---
    const renderEditView = (ideaData) => {
        contentWrapper.innerHTML = ''; // Clear previous content

        // Formatting Buttons for Edit Mode
        const editFormatButtonsDiv = document.createElement('div');
        editFormatButtonsDiv.className = "flex flex-wrap gap-3 mb-4 justify-start"; // Align left for edit mode
        
        const editIdeaTextarea = document.createElement('textarea');
        editIdeaTextarea.className = "w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-400 resize-y mb-4";
        editIdeaTextarea.rows = 5;
        editIdeaTextarea.value = ideaData.idea || '';
        
        const createEditFormatButton = (label, syntaxBefore, syntaxAfter) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = "flex items-center justify-center w-10 h-10 bg-gray-200 hover:bg-blue-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold rounded-lg shadow-sm transition duration-200 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transform hover:scale-105";
            btn.textContent = label;
            btn.addEventListener('click', () => applyFormatting(syntaxBefore, syntaxAfter, editIdeaTextarea));
            return btn;
        };

        editFormatButtonsDiv.appendChild(createEditFormatButton('B', '**', '**'));
        editFormatButtonsDiv.appendChild(createEditFormatButton('I', '*', '*'));
        editFormatButtonsDiv.appendChild(createEditFormatButton('U', '<u>', '</u>'));
        editFormatButtonsDiv.appendChild(createEditFormatButton('$', '$', '$')); // LaTeX button
        contentWrapper.appendChild(editFormatButtonsDiv);
        contentWrapper.appendChild(editIdeaTextarea);

        // Edit Attribute Fields
        const editAttributesDiv = document.createElement('div');
        editAttributesDiv.className = "grid grid-cols-1 md:grid-cols-2 gap-4 mb-6";

        const createNumberInput = (id, label, placeholder, value) => {
            const div = document.createElement('div');
            div.innerHTML = `
                <label for="${id}" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <span class="font-semibold">${label}:</span>
                </label>
                <input type="number" id="${id}" min="0" placeholder="${placeholder}" value="${value || ''}"
                    class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-400">
            `;
            return div;
        };

        const createCheckboxInput = (id, label, checked) => {
            const div = document.createElement('div');
            div.className = "flex items-center";
            div.innerHTML = `
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}
                    class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 mr-2">
                <label for="${id}" class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span class="font-semibold">${label}</span>
                </label>
            `;
            return div;
        };

        editAttributesDiv.appendChild(createNumberInput('edit-memberCount', 'Members', 'e.g., 3', ideaData.memberCount));
        editAttributesDiv.appendChild(createNumberInput('edit-timeConsumingHours', 'Time (Hrs)', 'e.g., 2', ideaData.timeConsumingHours));
        editAttributesDiv.appendChild(createNumberInput('edit-timeToMakeDays', 'Setup (Days)', 'e.g., 1', ideaData.timeToMakeDays));
        editAttributesDiv.appendChild(createCheckboxInput('edit-requiresFunds', 'Requires Funds', ideaData.requiresFunds));
        contentWrapper.appendChild(editAttributesDiv);

        // Action Buttons for Edit Mode
        const editActionButtonsDiv = document.createElement('div');
        editActionButtonsDiv.className = "flex flex-wrap gap-3 justify-start";

        const saveButton = document.createElement('button');
        saveButton.className = "px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transform hover:scale-105";
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', () => {
            const updatedIdea = editIdeaTextarea.value.trim();
            if (updatedIdea) {
                const updatedData = {
                    idea: updatedIdea,
                    memberCount: parseInt(document.getElementById('edit-memberCount').value) || 0,
                    timeConsumingHours: parseInt(document.getElementById('edit-timeConsumingHours').value) || 0,
                    timeToMakeDays: parseInt(document.getElementById('edit-timeToMakeDays').value) || 0,
                    requiresFunds: document.getElementById('edit-requiresFunds').checked
                };
                updateIdea(idea.id, updatedData);
                renderDisplayView({ ...ideaData, ...updatedData }); // Switch back to display view with updated data
            } else {
                alert('Idea cannot be empty!');
            }
        });

        const cancelButton = document.createElement('button');
        cancelButton.className = "px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg shadow-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transform hover:scale-105";
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => renderDisplayView(idea));

        editActionButtonsDiv.appendChild(saveButton);
        editActionButtonsDiv.appendChild(cancelButton);
        contentWrapper.appendChild(editActionButtonsDiv);
    };

    // --- Initial Render: Display View ---
    renderDisplayView(idea);

    // --- Action Buttons (Edit, Delete) ---
    const actionButtonsDiv = document.createElement('div');
    actionButtonsDiv.className = "flex flex-wrap gap-3 mt-4 justify-end"; // Align right for display mode

    // Only show edit/delete if current user is the submitter
    if (idea.submittedBy === currentUserId) {
        const editButton = document.createElement('button');
        editButton.className = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transform hover:scale-105";
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => renderEditView(idea));

        const deleteButton = document.createElement('button');
        deleteButton.className = "px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transform hover:scale-105";
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => {
            ideaToDeleteId = idea.id;
            deleteModal.classList.remove('hidden');
        });

        actionButtonsDiv.appendChild(editButton);
        actionButtonsDiv.appendChild(deleteButton);
    }

    contentWrapper.appendChild(actionButtonsDiv);

    return cardDiv;
}

// --- Handle Voting ---
async function handleVote(ideaId, voteType, idea) {
    if (!db || !currentUserId) return;

    const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaId);
    const currentUpvotes = idea.upvotes || 0;
    const currentDownvotes = idea.downvotes || 0;
    const currentUpvoters = idea.votedBy?.up || [];
    const currentDownvoters = idea.votedBy?.down || [];

    let newUpvotes = currentUpvotes;
    let newDownvotes = currentDownvotes;
    let newUpvoters = [...currentUpvoters];
    let newDownvoters = [...currentDownvoters];

    const userAlreadyUpvoted = currentUpvoters.includes(currentUserId);
    const userAlreadyDownvoted = currentDownvoters.includes(currentUserId);

    if (voteType === 'upvote') {
        if (userAlreadyUpvoted) {
            // Remove upvote
            newUpvotes = currentUpvotes - 1;
            newUpvoters = currentUpvoters.filter(id => id !== currentUserId);
        } else {
            // Add upvote, remove downvote if exists
            newUpvotes = currentUpvotes + 1;
            newUpvoters.push(currentUserId);
            if (userAlreadyDownvoted) {
                newDownvotes = currentDownvotes - 1;
                newDownvoters = currentDownvoters.filter(id => id !== currentUserId);
            }
        }
    } else if (voteType === 'downvote') {
        if (userAlreadyDownvoted) {
            // Remove downvote
            newDownvotes = currentDownvotes - 1;
            newDownvoters = currentDownvoters.filter(id => id !== currentUserId);
        } else {
            // Add downvote, remove upvote if exists
            newDownvotes = currentDownvotes + 1;
            newDownvoters.push(currentUserId);
            if (userAlreadyUpvoted) {
                newUpvotes = currentUpvotes - 1;
                newUpvoters = newUpvoters.filter(id => id !== currentUserId);
            }
        }
    }

    try {
        await updateDoc(ideaRef, {
            upvotes: newUpvotes,
            downvotes: newDownvotes,
            'votedBy.up': newUpvoters,
            'votedBy.down': newDownvoters
        });
    } catch (error) {
        console.error("Error updating vote:", error);
    }
}

// --- Handle Idea Update (Edit) ---
async function updateIdea(ideaId, updatedData) {
    if (!db) return;
    const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaId);
    try {
        await updateDoc(ideaRef, updatedData);
    } catch (error) {
        console.error("Error updating idea:", error);
        alert('Failed to update idea. Please try again.');
    }
}

// --- Handle Idea Deletion ---
confirmDeleteBtn.addEventListener('click', async () => {
    if (!db || !ideaToDeleteId) return;
    const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaToDeleteId);
    try {
        await deleteDoc(ideaRef);
        deleteModal.classList.add('hidden');
        ideaToDeleteId = null;
    } catch (error) {
        console.error("Error deleting idea:", error);
        alert('Failed to delete idea. Please try again.');
    }
});

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    ideaToDeleteId = null;
});