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
const YOUR_CUSTOM_APP_ID = "math-club-ideas-board-v8-design-refresh"; // New ID for this version with design refresh

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null; // To store the anonymous user's ID
let currentSortOption = 'recent'; // Default sort option

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

// New Attribute Inputs
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
            memberCount: memberCount,
            timeConsumingHours: timeConsumingHours,
            timeToMakeDays: timeToMakeDays,
            requiresFunds: requiresFunds,
            submittedBy: currentUserId // Store the user ID of the submitter for owner-only features
        });
        ideaTextInput.value = ''; // Clear input
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

// --- Sort Options Handler ---
sortOptionsDropdown.addEventListener('change', (e) => {
    currentSortOption = e.target.value;
    // onSnapshot will re-trigger renderIdeas with the new sort.
});


// --- Real-time Ideas Listener ---
function listenForIdeas() {
    const ideasCollectionRef = collection(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`);
    const q = query(ideasCollectionRef);

    onSnapshot(q, (snapshot) => {
        let fetchedIdeas = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // --- Apply Client-Side Sorting ---
        fetchedIdeas.sort((a, b) => {
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

        renderIdeas(fetchedIdeas);
    }, (error) => {
        console.error("Error fetching ideas:", error);
        ideasList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400 text-lg">Failed to load ideas. Please refresh and check your browser console.</p>`;
    });
}

// --- Render Ideas to DOM ---
function renderIdeas(ideas) {
    ideasList.innerHTML = '';
    if (ideas.length === 0) {
        ideasList.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 text-lg">No ideas submitted yet. Be the first!</p>`;
        return;
    }

    ideas.forEach(idea => {
        const ideaCard = createIdeaCard(idea);
        ideasList.appendChild(ideaCard);
    });
}

// --- Create Single Idea Card DOM Element (MAJOR CHANGES HERE) ---
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

        const ideaContentDiv = document.createElement('div');
        ideaContentDiv.className = "text-gray-800 dark:text-gray-100 text-lg leading-relaxed mb-3";
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
                    class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500">
            `;
            return div;
        };

        const createCheckboxInput = (id, label, checked) => {
            const div = document.createElement('div');
            div.className = "flex items-center mt-4 md:mt-0";
            div.innerHTML = `
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}
                    class="h-5 w-5 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-blue-400">
                <label for="${id}" class="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span class="font-semibold">${label}</span>
                </label>
            `;
            return div;
        };

        editAttributesDiv.appendChild(createNumberInput('editMemberCount', 'Member Count', 'e.g., 5', ideaData.memberCount));
        editAttributesDiv.appendChild(createNumberInput('editTimeConsumingHours', 'Time (Hours)', 'e.g., 10', ideaData.timeConsumingHours));
        editAttributesDiv.appendChild(createNumberInput('editTimeToMakeDays', 'Time to Make (Days)', 'e.g., 7', ideaData.timeToMakeDays));
        editAttributesDiv.appendChild(createCheckboxInput('editRequiresFunds', 'Requires Funds?', ideaData.requiresFunds));
        contentWrapper.appendChild(editAttributesDiv);

        // Save/Cancel Buttons
        const actionButtonsDiv = document.createElement('div');
        actionButtonsDiv.className = "flex justify-end space-x-4 mt-6";

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = "px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2";
        saveButton.textContent = 'Save Changes';
        saveButton.addEventListener('click', async () => {
            const updatedIdea = {
                idea: editIdeaTextarea.value.trim(),
                memberCount: parseInt(document.getElementById('editMemberCount').value) || 0,
                timeConsumingHours: parseInt(document.getElementById('editTimeConsumingHours').value) || 0,
                timeToMakeDays: parseInt(document.getElementById('editTimeToMakeDays').value) || 0,
                requiresFunds: document.getElementById('editRequiresFunds').checked,
                submittedBy: ideaData.submittedBy // Ensure submittedBy is preserved
            };
            try {
                const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaData.id);
                await updateDoc(ideaRef, updatedIdea);
                renderDisplayView(updatedIdea); // Re-render in display mode with new data
            } catch (error) {
                console.error("Error updating document: ", error);
                // Optionally display an error message to the user
            }
        });

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = "px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg shadow-md transition duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2";
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => renderDisplayView(ideaData)); // Revert to original display

        actionButtonsDiv.appendChild(cancelButton);
        actionButtonsDiv.appendChild(saveButton);
        contentWrapper.appendChild(actionButtonsDiv);
    };

    // Initial render: always display view
    renderDisplayView(idea);

    // --- Edit Button (Conditional Rendering) ---
    if (currentUserId && idea.submittedBy === currentUserId) {
        const editButton = document.createElement('button');
        // Adjusted class for better positioning and hover effect
        editButton.className = "absolute top-4 right-12 p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-800 dark:hover:text-white transition duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2";
        editButton.setAttribute('aria-label', 'Edit idea');
        editButton.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.38-2.828-2.828z"></path></svg>`;
        editButton.addEventListener('click', () => renderEditView(idea)); // Switch to edit mode
        cardDiv.appendChild(editButton);

        // Delete Button (position adjusted for edit button)
        const deleteButton = document.createElement('button');
        // Adjusted class for better positioning and hover effect
        deleteButton.className = "absolute top-4 right-4 p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-800 dark:hover:text-white transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2";
        deleteButton.setAttribute('aria-label', 'Delete idea');
        deleteButton.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd"></path></svg>`;
        deleteButton.addEventListener('click', () => showDeleteConfirmation(idea.id));
        cardDiv.appendChild(deleteButton);
    }

    return cardDiv;
}

// --- Handle Voting Logic (no changes needed here) ---
async function handleVote(ideaId, type, currentIdeaData) {
    if (!db || !currentUserId) {
        console.error("Database or User ID not available for voting. Cannot process vote.");
        return;
    }

    const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaId);

    let updatedUpvotes = currentIdeaData.upvotes;
    let updatedDownvotes = currentIdeaData.downvotes;
    let updatedVotedByUp = [...(currentIdeaData.votedBy?.up || [])];
    let updatedVotedByDown = [...(currentIdeaData.votedBy?.down || [])];

    const hasUpvoted = updatedVotedByUp.includes(currentUserId);
    const hasDownvoted = updatedVotedByDown.includes(currentUserId);

    try {
        if (type === 'upvote') {
            if (hasUpvoted) {
                updatedUpvotes--;
                updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== currentUserId);
            } else {
                updatedUpvotes++;
                updatedVotedByUp.push(currentUserId);
                if (hasDownvoted) {
                    updatedDownvotes--;
                    updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== currentUserId);
                }
            }
        } else if (type === 'downvote') {
            if (hasDownvoted) {
                updatedDownvotes--;
                updatedVotedByDown = updatedVotedByDown.filter(uid => uid !== currentUserId);
            } else {
                updatedDownvotes++;
                updatedVotedByDown.push(currentUserId);
                if (hasUpvoted) {
                    updatedUpvotes--;
                    updatedVotedByUp = updatedVotedByUp.filter(uid => uid !== currentUserId);
                }
            }
        }

        await updateDoc(ideaRef, {
            upvotes: updatedUpvotes,
            downvotes: updatedDownvotes,
            votedBy: {
                up: updatedVotedByUp,
                down: updatedVotedByDown
            }
        });
    } catch (error) {
        console.error("Error updating vote: ", error);
    }
}

// --- Delete Confirmation Modal Logic ---
function showDeleteConfirmation(id) {
    ideaToDeleteId = id; // Store the ID of the idea to be deleted
    deleteModal.classList.remove('hidden'); // Show the modal
}

function hideDeleteConfirmation() {
    deleteModal.classList.add('hidden'); // Hide the modal
    ideaToDeleteId = null; // Clear the stored ID
}

// Event listeners for the modal buttons
cancelDeleteBtn.addEventListener('click', hideDeleteConfirmation);
confirmDeleteBtn.addEventListener('click', async () => {
    if (ideaToDeleteId) {
        try {
            const ideaRef = doc(db, `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/ideas`, ideaToDeleteId);
            await deleteDoc(ideaRef);
            console.log("Document successfully deleted!");
        } catch (error) {
            console.error("Error removing document: ", error);
            // Optionally, show an error message to the user
        } finally {
            hideDeleteConfirmation(); // Always hide the modal
        }
    }
});