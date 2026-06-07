// script1.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const marked = window.marked;

if (marked) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
  });
}

const EXPORT_LAYOUT = {
  "very-easy": 3,
  "easy": 3,
  "medium": 3,
  "hard": 3,
  "very-hard": 3
};

const firebaseConfig = {
  apiKey: "AIzaSyBkFwqpkhoXj_bxMjxKvnvA3vlPGrJ_Sps",
  authDomain: "mathclubideas.firebaseapp.com",
  projectId: "mathclubideas",
  storageBucket: "mathclubideas.firebasestorage.app",
  messagingSenderId: "513454624671",
  appId: "1:513454624671:web:09af65e85abe3048caf7aa"
};

const YOUR_CUSTOM_APP_ID = "math-club-ideas-board-v8-design-refresh";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserId = null;
let currentSortOption = "mostReviewedThenHard";
let itemsPerPage = 10;
let currentPage = 0;
let allProblems = [];
let totalProblems = 0;

// DOM
const problemsList = document.getElementById("problemsList");
const problemForm = document.getElementById("problemForm");
const problemTextInput = document.getElementById("problemText");
const answerTextInput = document.getElementById("answerText");
const formMessage = document.getElementById("formMessage");
const userIdDisplay = document.getElementById("userIdDisplay");
const loadingOverlay = document.getElementById("loadingOverlay");
const errorOverlay = document.getElementById("errorOverlay");
const errorMessageText = document.getElementById("errorMessageText");
const sortOptionsDropdown = document.getElementById("sortOptions");
const itemsPerPageDropdown = document.getElementById("itemsPerPage");
const deleteModal = document.getElementById("deleteModal");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

let problemToDeleteId = null;
let paginationDiv, prevBtn, nextBtn, pageInfo;

// --------------------------
// Helpers
// --------------------------
function safeNumber(value, fallback = 0) {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeForLatex(text = "") {
  return String(text)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");
}

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function getDifficultyLevel(score) {
  if (score < 2.0) return { level: "easy", text: "Very Easy" };
  if (score < 3.0) return { level: "easy", text: "Easy" };
  if (score < 3.5) return { level: "medium", text: "Medium" };
  if (score < 4.0) return { level: "hard", text: "Hard" };
  return { level: "hard", text: "Very Hard" };
}

function getDifficultyBucket(score) {
  if (score < 2.0) return "very-easy";
  if (score < 3.0) return "easy";
  if (score < 3.5) return "medium";
  if (score < 4.0) return "hard";
  return "very-hard";
}

function getDifficultyBucketLabel(bucket) {
  const labels = {
    "very-easy": "Very Easy",
    "easy": "Easy",
    "medium": "Medium",
    "hard": "Hard",
    "very-hard": "Very Hard"
  };
  return labels[bucket] || bucket;
}

function computeRefereeSummary(problem) {
  const votes = problem.refereeVotes || {};
  const accepts = Object.values(votes).filter(v => v === "accept").length;
  const rejects = Object.values(votes).filter(v => v === "reject").length;

  let approvalStatus = "Pending";
  if (accepts >= 2) approvalStatus = "Approved";
  else if (rejects >= 2) approvalStatus = "Rejected";

  return { accepts, rejects, approvalStatus };
}

function ensureProblemDefaults(problem) {
  const difficultyRatings = problem.difficultyRatings || {};
  const refereeVotes = problem.refereeVotes || {};
  const refereeDifficultyRatings = problem.refereeDifficultyRatings || {};
  const totalDifficultyRatings = safeNumber(problem.totalDifficultyRatings, 0);
  const estimatedDifficulty = safeNumber(problem.estimatedDifficulty, 3.0);

  const refereeSummary = computeRefereeSummary({
    ...problem,
    refereeVotes
  });

  return {
    ...problem,
    difficultyRatings,
    refereeVotes,
    refereeDifficultyRatings,
    totalDifficultyRatings,
    estimatedDifficulty,
    acceptCount: safeNumber(problem.acceptCount, refereeSummary.accepts),
    rejectCount: safeNumber(problem.rejectCount, refereeSummary.rejects),
    approvalStatus: problem.approvalStatus || refereeSummary.approvalStatus
  };
}

function typesetMath() {
  setTimeout(() => {
    if (window.MathJax && window.MathJax.typeset) {
      try {
        window.MathJax.typeset();
      } catch (e) {
        console.log("MathJax typeset error:", e);
      }
    }
  }, 80);
}

function displayFormMessage(msg, colorClass) {
  if (!formMessage) return;
  formMessage.textContent = msg;
  formMessage.className = `mt-2 text-center text-sm font-medium ${colorClass}`;
  setTimeout(() => {
    formMessage.textContent = "";
    formMessage.className = "";
  }, 3000);
}

function setExportMessage(text, isError = false) {
  const el = document.getElementById("exportMessage");
  if (!el) return;
  el.textContent = text;
  el.className = `mt-3 text-sm ${isError ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`;
}

function getApprovedProblemsGroupedByDifficulty() {
  const approved = allProblems.filter((p) => p.approvalStatus === "Approved");

  const grouped = {
    "very-easy": [],
    "easy": [],
    "medium": [],
    "hard": [],
    "very-hard": []
  };

  approved.forEach((p) => {
    const bucket = getDifficultyBucket(p.estimatedDifficulty || 3);
    grouped[bucket].push(p);
  });

  return grouped;
}

// --------------------------
// Auth
// --------------------------
onAuthStateChanged(
  auth,
  async (user) => {
    if (user) {
      currentUserId = user.uid;
      if (userIdDisplay) userIdDisplay.textContent = `${currentUserId.substring(0, 8)}...`;
      console.log("AUTH UID:", currentUserId);
      listenForProblems();
      ensureExportControls();
    } else {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Error signing in anonymously:", e);
        if (errorMessageText) {
          errorMessageText.textContent =
            "Failed to authenticate. Please ensure Anonymous Auth is enabled in your Firebase project.";
        }
        if (errorOverlay) errorOverlay.classList.remove("hidden");
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
      }
    }
  },
  (error) => {
    console.error("Auth state change error:", error);
    if (errorMessageText) errorMessageText.textContent = "Authentication error. Please check your Firebase setup.";
    if (errorOverlay) errorOverlay.classList.remove("hidden");
    if (loadingOverlay) loadingOverlay.classList.add("hidden");
  }
);

// --------------------------
// Submission
// --------------------------
if (problemForm) {
  problemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const problemContent = problemTextInput.value.trim();
    const answerContent = answerTextInput.value.trim();

    if (!problemContent || !answerContent) {
      displayFormMessage("Both problem and answer are required!", "text-red-600");
      return;
    }

    if (!db || !currentUserId) {
      displayFormMessage("App not ready. Please wait for authentication.", "text-red-600");
      return;
    }

    try {
      const problemsCollectionRef = collection(
        db,
        `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`
      );

      await addDoc(problemsCollectionRef, {
        problem: problemContent,
        answer: answerContent,
        difficultyScore: 3.0,
        difficultyRatings: {},
        totalDifficultyRatings: 0,
        estimatedDifficulty: 3.0,
        refereeVotes: {},
        refereeDifficultyRatings: {},
        acceptCount: 0,
        rejectCount: 0,
        approvalStatus: "Pending",
        createdAt: serverTimestamp(),
        submittedBy: currentUserId,
        status: "active",
        type: "integral"
      });

      problemTextInput.value = "";
      answerTextInput.value = "";
      displayFormMessage("Integral problem submitted successfully!", "text-green-600");
    } catch (error) {
      console.error("Error adding document:", error);
      displayFormMessage(`Failed to submit problem: ${error.message}`, "text-red-600");
    }
  });
}

// --------------------------
// Sort / pagination
// --------------------------
if (sortOptionsDropdown) {
  sortOptionsDropdown.addEventListener("change", (e) => {
    currentSortOption = e.target.value;
    currentPage = 0;
    applyAndRenderSorting();
  });
}

if (itemsPerPageDropdown) {
  itemsPerPageDropdown.addEventListener("change", (e) => {
    itemsPerPage = parseInt(e.target.value, 10);
    currentPage = 0;
    applyAndRenderSorting();
  });
}

// --------------------------
// Firestore listener
// --------------------------
function listenForProblems() {
  try {
    const problemsCollectionRef = collection(
      db,
      `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`
    );
    const q = query(problemsCollectionRef);

    onSnapshot(
      q,
      (snapshot) => {
        allProblems = snapshot.docs.map((d) =>
          ensureProblemDefaults({
            id: d.id,
            ...d.data()
          })
        );

        totalProblems = allProblems.length;
        updateProblemsCount();
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
        applyAndRenderSorting();
      },
      (error) => {
        console.error("Error in listener:", error);
        if (problemsList) {
          problemsList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400">Failed to load integral problems. Error: ${escapeHtml(error.message)}</p>`;
        }
        if (loadingOverlay) loadingOverlay.classList.add("hidden");
      }
    );
  } catch (error) {
    console.error("Error setting up listener:", error);
    if (problemsList) {
      problemsList.innerHTML = `<p class="text-center text-red-600 dark:text-red-400">Setup error: ${escapeHtml(error.message)}</p>`;
    }
    if (loadingOverlay) loadingOverlay.classList.add("hidden");
  }
}

function updateProblemsCount() {
  const countDisplay = document.getElementById("problemsCountDisplay");
  if (countDisplay) {
    const approvedCount = allProblems.filter((p) => p.approvalStatus === "Approved").length;
    countDisplay.textContent = `Total: ${totalProblems} problems • Approved: ${approvedCount}`;
  }
}

function applyAndRenderSorting() {
  let sortedProblems = [...allProblems];

  sortedProblems.sort((a, b) => {
    const aReviews = safeNumber(a.totalDifficultyRatings, 0);
    const bReviews = safeNumber(b.totalDifficultyRatings, 0);
    const aDifficulty = safeNumber(a.estimatedDifficulty, 3);
    const bDifficulty = safeNumber(b.estimatedDifficulty, 3);
    const aAccepts = safeNumber(a.acceptCount, 0);
    const bAccepts = safeNumber(b.acceptCount, 0);

    switch (currentSortOption) {
      case "mostReviewedThenHard":
        if (bAccepts !== aAccepts) return bAccepts - aAccepts;
        if (bReviews !== aReviews) return bReviews - aReviews;
        return bDifficulty - aDifficulty;

      case "hardestFirst":
        return bDifficulty - aDifficulty;

      case "easiestFirst":
        return aDifficulty - bDifficulty;

      case "mostReviewed":
        return bReviews - aReviews;

      case "recent": {
        const timeA = a.createdAt ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      }

      default:
        return bReviews - aReviews;
    }
  });

  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProblems = sortedProblems.slice(startIndex, endIndex);

  renderProblems(paginatedProblems);
  updatePagination(sortedProblems.length);
}

function updatePagination(totalFilteredProblems) {
  if (!problemsList || !problemsList.parentNode) return;

  if (!paginationDiv) {
    paginationDiv = document.createElement("div");
    paginationDiv.id = "pagination";
    paginationDiv.className = "mt-8 flex justify-center items-center space-x-4";

    prevBtn = document.createElement("button");
    prevBtn.id = "prevBtn";
    prevBtn.className =
      "px-4 py-2 border dark:border-gray-700 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center";
    prevBtn.innerHTML = `
      <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Previous
    `;
    prevBtn.addEventListener("click", () => {
      if (currentPage > 0) {
        currentPage--;
        applyAndRenderSorting();
      }
    });

    pageInfo = document.createElement("span");
    pageInfo.id = "pageInfo";
    pageInfo.className = "text-sm dark:text-gray-400 font-serif";

    nextBtn = document.createElement("button");
    nextBtn.id = "nextBtn";
    nextBtn.className =
      "px-4 py-2 border dark:border-gray-700 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center";
    nextBtn.innerHTML = `
      Next
      <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    `;
    nextBtn.addEventListener("click", () => {
      const totalPages = Math.ceil(totalFilteredProblems / itemsPerPage);
      if (currentPage < totalPages - 1) {
        currentPage++;
        applyAndRenderSorting();
      }
    });

    paginationDiv.appendChild(prevBtn);
    paginationDiv.appendChild(pageInfo);
    paginationDiv.appendChild(nextBtn);

    problemsList.parentNode.appendChild(paginationDiv);
  }

  const totalPages = Math.ceil(totalFilteredProblems / itemsPerPage);
  const startItem = currentPage * itemsPerPage + 1;
  const endItem = Math.min((currentPage + 1) * itemsPerPage, totalFilteredProblems);
  const displayStartItem = totalFilteredProblems > 0 ? startItem : 0;
  const displayEndItem = totalFilteredProblems > 0 ? endItem : 0;

  pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages || 1} (${displayStartItem}-${displayEndItem} of ${totalFilteredProblems})`;
  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage >= totalPages - 1 || totalPages <= 1;

  if (totalFilteredProblems <= itemsPerPage || totalPages <= 1) {
    paginationDiv.classList.add("hidden");
  } else {
    paginationDiv.classList.remove("hidden");
  }
}

// --------------------------
// Render cards
// --------------------------
function renderProblems(problems) {
  if (!problemsList) return;

  problemsList.innerHTML = "";

  if (problems.length === 0) {
    problemsList.innerHTML = `
      <div class="text-center py-12">
        <svg class="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400 text-lg mb-4 font-serif">No integral problems found!</p>
        <p class="text-gray-400 dark:text-gray-500 text-sm font-serif">Be the first to submit an integral problem.</p>
      </div>
    `;
    return;
  }

  problems.forEach((problem) => {
    problemsList.appendChild(createProblemCard(problem));
  });

  typesetMath();
}

function createProblemCard(problem) {
  const cardDiv = document.createElement("div");
  cardDiv.className = "problem-card rounded-lg p-6";

  const isOwner = problem.submittedBy === currentUserId;
  const myRefVote = problem.refereeVotes?.[currentUserId] || null;
  const myRefDifficulty = problem.refereeDifficultyRatings?.[currentUserId] || null;

  const headerDiv = document.createElement("div");
  headerDiv.className = "flex justify-between items-start mb-4";

  const difficultyInfo = document.createElement("div");
  difficultyInfo.className = "flex items-center space-x-2 flex-wrap";

  const difficulty = getDifficultyLevel(problem.estimatedDifficulty || 3.0);
  const difficultyBadge = document.createElement("span");
  difficultyBadge.className = `difficulty-badge difficulty-${difficulty.level}`;
  difficultyBadge.textContent = difficulty.text;

  const reviewsCount = problem.totalDifficultyRatings || 0;
  const reviewsSpan = document.createElement("span");
  reviewsSpan.className = "text-xs text-gray-500 dark:text-gray-400";
  reviewsSpan.textContent = `${reviewsCount} public difficulty ${reviewsCount === 1 ? "review" : "reviews"}`;

  const approvalSpan = document.createElement("span");
  approvalSpan.className =
    problem.approvalStatus === "Approved"
      ? "text-xs px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : problem.approvalStatus === "Rejected"
      ? "text-xs px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      : "text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  approvalSpan.textContent = `Referee: ${problem.approvalStatus}`;

  difficultyInfo.appendChild(difficultyBadge);
  difficultyInfo.appendChild(reviewsSpan);
  difficultyInfo.appendChild(approvalSpan);

  const metaDiv = document.createElement("div");
  metaDiv.className = "text-sm text-gray-500 dark:text-gray-400 text-right";
  metaDiv.innerHTML = `
    <div>Avg: ${(problem.estimatedDifficulty || 3).toFixed(1)}/5</div>
    <div>Accepts: ${problem.acceptCount || 0} • Rejects: ${problem.rejectCount || 0}</div>
  `;

  headerDiv.appendChild(difficultyInfo);
  headerDiv.appendChild(metaDiv);
  cardDiv.appendChild(headerDiv);

  const problemDiv = document.createElement("div");
  problemDiv.className = "mb-4";
  problemDiv.innerHTML = `
    <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 font-serif">Problem:</div>
    <div class="math-display bg-gray-50 dark:bg-gray-800 rounded p-4 font-mono text-lg overflow-x-auto">
      \\[ ${problem.problem} \\]
    </div>
  `;
  cardDiv.appendChild(problemDiv);

  const copyProblemBtn = document.createElement("button");
  copyProblemBtn.className =
    "text-xs px-3 py-1 mb-4 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center";
  copyProblemBtn.innerHTML = `
    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
    Copy Problem LaTeX
  `;
  copyProblemBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(problem.problem);
      copyProblemBtn.textContent = "Copied!";
      setTimeout(() => {
        copyProblemBtn.innerHTML = `
          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy Problem LaTeX
        `;
      }, 1200);
    } catch (err) {
      console.error(err);
    }
  });
  cardDiv.appendChild(copyProblemBtn);

  const answerDiv = document.createElement("div");
  answerDiv.className = "answer-section hidden";
  answerDiv.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <div class="text-sm font-medium text-gray-700 dark:text-gray-300 font-serif">Answer:</div>
      <button class="copy-answer-latex-btn text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex items-center">
        Copy Answer LaTeX
      </button>
    </div>
    <div class="math-display font-mono text-lg overflow-x-auto">
      \\[ ${problem.answer} \\]
    </div>
  `;
  cardDiv.appendChild(answerDiv);

  const ratingDiv = document.createElement("div");
  ratingDiv.className = "mb-4";
  ratingDiv.innerHTML = `
    <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 font-serif">Public difficulty rating (1=easiest, 5=hardest):</div>
    <div class="flex space-x-1">
      ${[1, 2, 3, 4, 5].map((num) => {
        const userRating = problem.difficultyRatings && problem.difficultyRatings[currentUserId];
        const isActive = userRating === num;
        return `
          <button class="difficulty-btn px-3 py-1 rounded text-sm font-medium transition-colors rating-btn
            ${isActive
              ? "bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 border border-blue-300 dark:border-blue-700"
              : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700"}"
            data-rating="${num}" data-problem-id="${problem.id}">
            ${num}
          </button>
        `;
      }).join("")}
    </div>
  `;
  cardDiv.appendChild(ratingDiv);

  const refereeSection = document.createElement("div");
  refereeSection.className = "mb-4 p-4 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";
  refereeSection.innerHTML = `
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="text-sm font-medium text-gray-700 dark:text-gray-300 font-serif">Anonymous Referee Review</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">
          Status: ${problem.approvalStatus} • Accepts: ${problem.acceptCount || 0} • Rejects: ${problem.rejectCount || 0}
        </div>
      </div>

      ${
        isOwner
          ? `<div class="text-xs text-gray-500 dark:text-gray-400">You submitted this problem, so you cannot referee it.</div>`
          : `
            <div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 font-serif">Referee difficulty vote:</div>
              <div class="flex space-x-1">
                ${[1, 2, 3, 4, 5].map((num) => `
                  <button
                    class="ref-difficulty-btn px-3 py-1 rounded text-sm font-medium transition-colors rating-btn
                      ${myRefDifficulty === num
                        ? "bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100 border border-purple-300 dark:border-purple-700"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700"}"
                    data-rating="${num}"
                    data-problem-id="${problem.id}">
                    ${num}
                  </button>
                `).join("")}
              </div>
            </div>

            <div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 font-serif">Referee decision:</div>
              <div class="flex gap-2">
                <button
                  class="ref-vote-btn px-3 py-2 rounded text-sm font-medium border transition-colors
                    ${myRefVote === "accept"
                      ? "bg-green-200 text-green-900 border-green-400 dark:bg-green-800 dark:text-green-100 dark:border-green-600"
                      : "bg-white dark:bg-gray-900 text-green-700 border-green-300 dark:text-green-300 dark:border-green-700"}"
                  data-vote="accept"
                  data-problem-id="${problem.id}">
                  Accept
                </button>

                <button
                  class="ref-vote-btn px-3 py-2 rounded text-sm font-medium border transition-colors
                    ${myRefVote === "reject"
                      ? "bg-red-200 text-red-900 border-red-400 dark:bg-red-800 dark:text-red-100 dark:border-red-600"
                      : "bg-white dark:bg-gray-900 text-red-700 border-red-300 dark:text-red-300 dark:border-red-700"}"
                  data-vote="reject"
                  data-problem-id="${problem.id}">
                  Reject
                </button>
              </div>
            </div>
          `
      }
    </div>
  `;
  cardDiv.appendChild(refereeSection);

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "flex flex-wrap justify-between items-center mt-6 pt-4 border-t dark:border-gray-700";

  const leftActions = document.createElement("div");
  leftActions.className = "flex items-center space-x-4";

  const showAnswerBtn = document.createElement("button");
  showAnswerBtn.className =
    "text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors flex items-center";
  showAnswerBtn.textContent = "Show Answer";
  showAnswerBtn.addEventListener("click", () => {
    answerDiv.classList.toggle("hidden");
    showAnswerBtn.textContent = answerDiv.classList.contains("hidden") ? "Show Answer" : "Hide Answer";
  });
  leftActions.appendChild(showAnswerBtn);

  const rightActions = document.createElement("div");
  rightActions.className = "flex items-center space-x-3";

  if (isOwner) {
    const editBtn = document.createElement("button");
    editBtn.className =
      "text-sm px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => showEditForm(problem, cardDiv));

    const deleteBtn = document.createElement("button");
    deleteBtn.className =
      "text-sm px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      problemToDeleteId = problem.id;
      if (deleteModal) deleteModal.classList.remove("hidden");
    });

    rightActions.appendChild(editBtn);
    rightActions.appendChild(deleteBtn);
  }

  actionsDiv.appendChild(leftActions);
  actionsDiv.appendChild(rightActions);
  cardDiv.appendChild(actionsDiv);

  if (problem.createdAt) {
    const timestampDiv = document.createElement("div");
    timestampDiv.className =
      "text-xs text-gray-500 dark:text-gray-500 mt-4 pt-2 border-t dark:border-gray-700 flex items-center";
    timestampDiv.textContent = `Submitted: ${problem.createdAt.toDate().toLocaleString()}`;
    cardDiv.appendChild(timestampDiv);
  }

  cardDiv.querySelectorAll(".difficulty-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const rating = parseInt(e.currentTarget.getAttribute("data-rating"), 10);
      const problemId = e.currentTarget.getAttribute("data-problem-id");
      handleDifficultyRating(problemId, rating);
    });
  });

  cardDiv.querySelectorAll(".ref-difficulty-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const rating = parseInt(e.currentTarget.getAttribute("data-rating"), 10);
      const problemId = e.currentTarget.getAttribute("data-problem-id");
      handleRefereeDifficulty(problemId, rating);
    });
  });

  cardDiv.querySelectorAll(".ref-vote-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const vote = e.currentTarget.getAttribute("data-vote");
      const problemId = e.currentTarget.getAttribute("data-problem-id");
      handleRefereeVote(problemId, vote);
    });
  });

  const copyAnswerBtn = cardDiv.querySelector(".copy-answer-latex-btn");
  if (copyAnswerBtn) {
    copyAnswerBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(problem.answer);
        copyAnswerBtn.textContent = "Copied!";
        setTimeout(() => {
          copyAnswerBtn.textContent = "Copy Answer LaTeX";
        }, 1200);
      } catch (err) {
        console.error(err);
      }
    });
  }

  return cardDiv;
}

// --------------------------
// Edit / update / delete
// --------------------------
function showEditForm(problem, cardDiv) {
  const editForm = document.createElement("div");
  editForm.className =
    "mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700";

  editForm.innerHTML = `
    <div class="mb-3 text-sm font-medium dark:text-gray-300 font-serif">Edit Problem</div>

    <div class="mb-3">
      <label class="block text-xs mb-1 dark:text-gray-400 font-serif">Problem (LaTeX):</label>
      <textarea id="edit-problem-${problem.id}" rows="3" class="springer-input w-full text-sm font-mono">${escapeHtml(problem.problem)}</textarea>
    </div>

    <div class="mb-4">
      <label class="block text-xs mb-1 dark:text-gray-400 font-serif">Answer (LaTeX):</label>
      <textarea id="edit-answer-${problem.id}" rows="2" class="springer-input w-full text-sm font-mono">${escapeHtml(problem.answer)}</textarea>
    </div>

    <div class="flex space-x-2">
      <button id="save-edit-${problem.id}" class="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">Save</button>
      <button id="cancel-edit-${problem.id}" class="text-xs px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700">Cancel</button>
    </div>
  `;

  const problemDiv = cardDiv.querySelector(".math-display").parentElement;
  const copyBtn = copyBtnByText(cardDiv, "Copy Problem LaTeX");
  const answerDiv = cardDiv.querySelector(".answer-section");

  problemDiv.classList.add("hidden");
  if (copyBtn) copyBtn.classList.add("hidden");
  if (answerDiv) answerDiv.classList.add("hidden");

  const headerDiv = cardDiv.querySelector(".flex.justify-between.items-start.mb-4");
  headerDiv.parentNode.insertBefore(editForm, headerDiv.nextSibling);

  document.getElementById(`save-edit-${problem.id}`).addEventListener("click", () => {
    const newProblem = document.getElementById(`edit-problem-${problem.id}`).value.trim();
    const newAnswer = document.getElementById(`edit-answer-${problem.id}`).value.trim();

    if (!newProblem || !newAnswer) {
      alert("Both problem and answer are required.");
      return;
    }

    updateProblem(problem.id, newProblem, newAnswer);
    editForm.remove();
    problemDiv.classList.remove("hidden");
    if (copyBtn) copyBtn.classList.remove("hidden");
  });

  document.getElementById(`cancel-edit-${problem.id}`).addEventListener("click", () => {
    editForm.remove();
    problemDiv.classList.remove("hidden");
    if (copyBtn) copyBtn.classList.remove("hidden");
  });
}

function copyBtnByText(root, text) {
  const buttons = root.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent && btn.textContent.includes(text)) return btn;
  }
  return null;
}

async function updateProblem(problemId, newProblem, newAnswer) {
  if (!db || !currentUserId) return;

  const problemRef = doc(
    db,
    `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`,
    problemId
  );

  try {
    await updateDoc(problemRef, {
      problem: newProblem,
      answer: newAnswer
    });
  } catch (error) {
    console.error("Error updating problem:", error);
    alert(`Failed to update problem: ${error.message}`);
  }
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener("click", async () => {
    if (!db || !problemToDeleteId) return;

    const problemRef = doc(
      db,
      `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`,
      problemToDeleteId
    );

    try {
      await deleteDoc(problemRef);
      if (deleteModal) deleteModal.classList.add("hidden");
      problemToDeleteId = null;
    } catch (error) {
      console.error("Error deleting problem:", error);
      alert(`Failed to delete problem: ${error.message}`);
    }
  });
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener("click", () => {
    if (deleteModal) deleteModal.classList.add("hidden");
    problemToDeleteId = null;
  });
}

// --------------------------
// Public difficulty rating
// --------------------------
async function handleDifficultyRating(problemId, rating) {
  if (!db || !currentUserId) {
    alert("Please wait for authentication to complete.");
    return;
  }

  const problemRef = doc(
    db,
    `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`,
    problemId
  );

  try {
    const currentProblem = allProblems.find((p) => p.id === problemId);
    if (!currentProblem) return;

    const currentRatings = { ...(currentProblem.difficultyRatings || {}) };
    const currentTotalRatings = safeNumber(currentProblem.totalDifficultyRatings, 0);
    const currentEstimated = safeNumber(currentProblem.estimatedDifficulty, 3.0);

    const previousRating = currentRatings[currentUserId] || 0;
    currentRatings[currentUserId] = rating;

    let newTotalRatings = currentTotalRatings;
    let newEstimated = currentEstimated;

    if (previousRating === 0) {
      newTotalRatings++;
      newEstimated = (currentEstimated * currentTotalRatings + rating) / newTotalRatings;
    } else {
      newEstimated = (currentEstimated * currentTotalRatings - previousRating + rating) / currentTotalRatings;
    }

    await updateDoc(problemRef, {
      difficultyRatings: currentRatings,
      totalDifficultyRatings: newTotalRatings,
      estimatedDifficulty: parseFloat(newEstimated.toFixed(2)),
      difficultyScore: parseFloat(newEstimated.toFixed(2))
    });
  } catch (error) {
    console.error("Error updating difficulty rating:", error);
    alert(`Failed to update rating: ${error.message}`);
  }
}

// --------------------------
// Referee features
// --------------------------
async function handleRefereeDifficulty(problemId, rating) {
  if (!db || !currentUserId) {
    alert("Please wait for authentication.");
    return;
  }

  const currentProblem = allProblems.find((p) => p.id === problemId);
  if (!currentProblem) {
    alert("Problem not found.");
    return;
  }

  if (currentProblem.submittedBy === currentUserId) {
    alert("You cannot referee your own problem.");
    return;
  }

  const problemRef = doc(
    db,
    `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`,
    problemId
  );

  try {
    const refereeDifficultyRatings = {
      ...(currentProblem.refereeDifficultyRatings || {})
    };

    refereeDifficultyRatings[currentUserId] = rating;

    await updateDoc(problemRef, {
      refereeDifficultyRatings
    });
  } catch (error) {
    console.error("REFEREE DIFFICULTY ERROR:", error);
    alert(`Failed to update referee difficulty: ${error.message}`);
  }
}

async function handleRefereeVote(problemId, vote) {
  if (!db || !currentUserId) {
    alert("Please wait for authentication.");
    return;
  }

  const currentProblem = allProblems.find((p) => p.id === problemId);
  if (!currentProblem) {
    alert("Problem not found.");
    return;
  }

  if (currentProblem.submittedBy === currentUserId) {
    alert("You cannot referee your own problem.");
    return;
  }

  const problemRef = doc(
    db,
    `artifacts/${YOUR_CUSTOM_APP_ID}/public/data/integralProblems`,
    problemId
  );

  try {
    const refereeVotes = { ...(currentProblem.refereeVotes || {}) };
    refereeVotes[currentUserId] = vote;

    const accepts = Object.values(refereeVotes).filter(v => v === "accept").length;
    const rejects = Object.values(refereeVotes).filter(v => v === "reject").length;

    let approvalStatus = "Pending";
    if (accepts >= 2) approvalStatus = "Approved";
    else if (rejects >= 2) approvalStatus = "Rejected";

    await updateDoc(problemRef, {
      refereeVotes,
      acceptCount: accepts,
      rejectCount: rejects,
      approvalStatus
    });
  } catch (error) {
    console.error("REFEREE VOTE ERROR:", error);
    alert(`Failed referee vote: ${error.message}`);
  }
}

// --------------------------
// Export controls
// --------------------------
function ensureExportControls() {
  if (document.getElementById("exportControls")) return;

  const main = document.querySelector("main.springer-container");
  if (!main) return;

  const wrapper = document.createElement("div");
  wrapper.id = "exportControls";
  wrapper.className =
    "mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700";

  wrapper.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h3 class="springer-title text-xl mb-1">Approved Referee Export</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Export approved integrals as combined PDF or LaTeX.
        </p>
      </div>
      <div class="flex gap-3 flex-wrap">
        <button id="exportLatexBtn" class="btn-secondary">Export LaTeX</button>
        <button id="exportPdfBtn" class="btn-primary">PDF: Questions Only</button>
        <button id="exportPdfSolutionsBtn" class="btn-primary">PDF: Questions + Solutions</button>
      </div>
    </div>
    <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
      Layout: Very Easy 3, Easy 3, Medium 2, Hard 1, Very Hard 1 per sheet.
    </p>
    <p id="exportMessage" class="mt-3 text-sm text-gray-500 dark:text-gray-400"></p>
  `;

  const divider = main.querySelector(".section-divider");
  if (divider) {
    main.insertBefore(wrapper, divider);
  } else {
    main.appendChild(wrapper);
  }

  document.getElementById("exportLatexBtn").addEventListener("click", exportApprovedLatex);
  document.getElementById("exportPdfBtn").addEventListener("click", () => exportApprovedPdf(false));
  document.getElementById("exportPdfSolutionsBtn").addEventListener("click", () => exportApprovedPdf(true));
}

function buildCombinedLatexDocument(groupedProblems, layoutConfig) {
  const difficultyOrder = ["very-easy", "easy", "medium", "hard", "very-hard"];
  let body = "";

  difficultyOrder.forEach((bucket) => {
    const problems = groupedProblems[bucket] || [];
    if (!problems.length) return;

    const perSheet = layoutConfig[bucket] || 3;
    const groups = chunkArray(problems, perSheet);
    const title = getDifficultyBucketLabel(bucket);

    groups.forEach((group, sheetIndex) => {
      body += `
\\section*{${sanitizeForLatex(title)} — Sheet ${sheetIndex + 1}}
`;

      group.forEach((p, index) => {
        body += `
\\noindent\\textbf{Question ${sheetIndex * perSheet + index + 1}}\\\\[4pt]
\\[
${p.problem}
\\]

\\vspace{1cm}
`;
      });

      body += `\\newpage\n`;
    });
  });

  return `
\\documentclass[12pt]{article}
\\usepackage[a4paper,margin=0.8in]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{lmodern}
\\usepackage[T1]{fontenc}
\\pagestyle{empty}

\\begin{document}
\\begin{center}
{\\Large \\textbf{Integral Bee Approved Problems}}\\\\[6pt]
{\\normalsize Combined export by difficulty}
\\end{center}

${body}

\\end{document}
  `.trim();
}

function exportApprovedLatex() {
  const grouped = getApprovedProblemsGroupedByDifficulty();
  const totalApproved = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

  if (totalApproved === 0) {
    setExportMessage("No referee-approved problems available to export.", true);
    return;
  }

  const latex = buildCombinedLatexDocument(grouped, EXPORT_LAYOUT);
  downloadTextFile("approved_integrals_combined.tex", latex, "application/x-tex;charset=utf-8");
  setExportMessage("Exported one combined LaTeX file for all approved problems.");
}

function buildCombinedPdfHtml(groupedProblems, layoutConfig, includeSolutions = false) {
  const difficultyOrder = ["very-easy", "easy", "medium", "hard", "very-hard"];
  let allSheetsHtml = "";
  let totalQuestions = 0;

  difficultyOrder.forEach((bucket) => {
    const problems = groupedProblems[bucket] || [];
    if (!problems.length) return;

    const perSheet = layoutConfig[bucket] || 3;
    const groups = chunkArray(problems, perSheet);
    const title = getDifficultyBucketLabel(bucket);

    groups.forEach((group, sheetIndex) => {
      totalQuestions += group.length;

      const questionsHtml = group.map((p, index) => `
        <div class="question-block">
          <div class="q-label">
            ${escapeHtml(title)} • Question ${sheetIndex * perSheet + index + 1}
          </div>

          <div class="math question-math">
            \\[ ${escapeHtml(p.problem)} \\]
          </div>

          ${
            includeSolutions
              ? `
                <div class="solution-label">Solution / Answer</div>
                <div class="math answer-math">
                  \\[ ${escapeHtml(p.answer)} \\]
                </div>
              `
              : ""
          }
        </div>
      `).join("");

      allSheetsHtml += `
        <section class="sheet">
          <div class="sheet-title">Integral Bee Approved Problems</div>
          <div class="sheet-subtitle">
            ${escapeHtml(title)} — Sheet ${sheetIndex + 1}
          </div>
          <div class="sheet-meta">
            ${group.length} problem(s) on this sheet
            ${includeSolutions ? " • with solutions" : ""}
          </div>
          ${questionsHtml}
        </section>
      `;
    });
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title></title>
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']] },
      svg: { fontCache: 'global' }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
  <style>
    @page {
      size: A4;
      margin: 12mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 0;
      background: white;
    }

    .sheet {
      width: 100%;
      min-height: 100vh;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }

    .sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .sheet-title {
      text-align: center;
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .sheet-subtitle {
      text-align: center;
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .sheet-meta {
      text-align: center;
      font-size: 12px;
      color: #555;
      margin-bottom: 14px;
    }

    .question-block {
      border: 1px solid #d9d9d9;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .q-label {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .solution-label {
      font-size: 13px;
      font-weight: 700;
      margin-top: 10px;
      margin-bottom: 6px;
      color: #333;
      border-top: 1px dashed #bbb;
      padding-top: 8px;
    }

    .math {
      font-size: 19px;
      overflow-wrap: anywhere;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .question-math {
      min-height: ${includeSolutions ? "70px" : "100px"};
    }

    .answer-math {
      min-height: 50px;
      font-size: 17px;
    }

    .print-note {
      text-align: center;
      padding: 10px 0 14px;
      color: #666;
      font-size: 12px;
    }

    @media print {
      .print-note {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-note">
    Total approved questions: ${totalQuestions}.
    ${includeSolutions ? "Questions + solutions" : "Questions"}
    
  </div>

  ${allSheetsHtml}

  <script>
    function waitForMathAndPrint() {
      if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise.then(() => {
          setTimeout(() => {
            window.print();
          }, 1200);
        });
      } else {
        setTimeout(() => {
          window.print();
        }, 1800);
      }
    }

    waitForMathAndPrint();
  </script>
</body>
</html>
  `.trim();
}

function exportApprovedPdf(includeSolutions = false) {
  const grouped = getApprovedProblemsGroupedByDifficulty();
  const totalApproved = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

  if (totalApproved === 0) {
    setExportMessage("No referee-approved problems available to export.", true);
    return;
  }

  const html = buildCombinedPdfHtml(grouped, EXPORT_LAYOUT, includeSolutions);
  const w = window.open("", "_blank");

  if (!w) {
    setExportMessage("Popup blocked. Please allow popups for PDF export.", true);
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  setExportMessage(
    includeSolutions
      ? "Opened combined print window with questions + solutions."
      : "Opened combined print window with questions only."
  );
}

console.log("Integral Bee platform script loaded successfully with referee system + export support.");