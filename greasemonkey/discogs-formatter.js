// ==UserScript==
// @name         Discogs Automator
// @namespace    http://renbussell.com
// @version      2.1
// @description  A handy script for automating common tasks on Discogs
// @author       Ben Russell (github.com/benrr101)
// @match        https://*.discogs.com/*
// @grant        none
// ==/UserScript==

// CONSTANTS ///////////////////////////////////////////////////////////////

const AutomatorLocalStorageKey = 'discogs-automator-state';
const AutomatorStyle = `
div.clickable:hover {
    cursor: pointer;
}

div#automator-icon {
    position: fixed;
    bottom: 20px;
    right: 20px;
    height: 40px;
    width: 40px;
    z-index: 9999999;
    padding: 5px;
    border-radius: 5px;
}

div#automator-container {
    position: fixed;
    bottom: 70px;
    right: 20px;
    z-index: 9999999;
    min-width: 300px;
    margin-bottom: 5px;
    padding: 5px;
    border-radius: 5px;
    background-color: darkolivegreen;
    
    display: inline-flex;
    flex-direction: column;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: stretch;
    align-content: stretch;
}

div.automator-container-entry {
    display: block;
    flex-grow: 0;
    flex-shrink: 1;
    flex-basis: auto;
    align-self: auto;
    order: 0;
}

div.automator-container-entry-icon {
    float: left;
    height: 24px;
    padding-right: 5px;
}

div.automator-container-entry-text {
    float: left;
    line-height: 24px;
    font-family: sans-serif;
}
`.trim();

const IconExclamation = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
const IconExtension = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>';
const IconMotorcycle = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"><path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.65-1.97-4.77-4.56-4.97zM7.82 15C7.4 16.15 6.28 17 5 17c-1.63 0-3-1.37-3-3s1.37-3 3-3c1.28 0 2.4.85 2.82 2H5v2h2.82zM19 17c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>';

const CreateMasterReleaseId = "createMasterReleaseId";
const DuplicateAsFlac = "duplicateAsFlac";
const DuplicateAsWav = "duplicateAsWav";

// UTILITIES ///////////////////////////////////////////////////////////////

async function addReleaseToMaster(id, shouldBeKeyRelease) {
    logMessage("Adding release to existing master release");

    if (!window.location.href.match(/\/master\//)) {
        fail("Master release URL does not match expected format, cannot continue.");
        return;
    }

    // Step 1: Add the release to the list
    const releasesTextArea = document.getElementById("master.releases");
    if (!releasesTextArea) {
        fail("Could not find releases text area");
        return;
    }

    releasesTextArea.value += `\n${id}`;

    // Step 2: Set the key release, if requested
    if (shouldBeKeyRelease) {
        let keyReleaseInput = document.getElementById("master.main");
        if (!keyReleaseInput) {
            fail("Could not find key releases input");
            return;
        }

        keyReleaseInput.value = id;
    }

    await writeMasterRelease();
}

function clearState() {
    localStorage.removeItem(AutomatorLocalStorageKey);
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function setReleasesForMaster(ids, keyRelease) {
    if (!ids || ids.length === 0) {
        fail("IDs must be provided for setting master release");
    }

    logMessage("Setting releases for master release");

    if (!window.location.href.match(/\/master\//)) {
        fail("Master release URL does not match expected format cannot continue.");
        return;
    }

    // Step 1: Set the list of releases
    const releasesTextArea = document.getElementById("master.releases");
    if (!releasesTextArea) {
        fail("Could not find releases text area");
        return;
    }

    ids.sort();
    releasesTextArea.value = ids.join("\n");

    // Step 2: Set the key release
    const keyReleaseInput = document.getElementById("master.main");
    if (!keyReleaseInput) {
        fail("Could not find key releases input");
        return;
    }

    // If a key release was not provided, use the first entry in the list
    keyReleaseInput.value = keyRelease || ids[0]?.trim();

    await writeMasterRelease();
}

function storeState(actionId, stateObject) {
    // Read in the current log messages
    let container = document.getElementById("automator-container");
    let logEntries = container
        ? Array(...container.querySelectorAll("div.automator-container-entry-text"))
            .map(entry => entry.textContent)
        : [];

    let completeState = {
        actionId: actionId,
        actionState: stateObject,
        logEntries: logEntries
    };
    let completeStateString = JSON.stringify(completeState);

    localStorage.setItem(AutomatorLocalStorageKey, completeStateString);
}

function waitForElement(selector) {
    return new Promise(resolve => {
        // If it already exists, just return it
        let alreadyExistingElement = document.querySelector(selector);
        if (alreadyExistingElement) {
            return resolve(alreadyExistingElement);
        }

        // If it does not exist, setup an observer
        const observer = new MutationObserver(mutations => {
            let mutatedElement = document.querySelector(selector);
            if (mutatedElement) {
                observer.disconnect();
                resolve(mutatedElement);
            }
        });

        observer.observe(document.body, {childList: true, subtree: true});
    });
}

async function writeMasterRelease() {
    // Step 1: Preview the changes
    const previewButton = document.querySelector("input.preview_button");
    if (!previewButton) {
        fail("Could not find preview button");
        return;
    }

    previewButton.dispatchEvent(new Event("click", {bubbles: true}));

    // Step 2: Hide the submit button so that we can force people to use the approval button
    // @TODO: This can probably be done with waitForElement?
    const submitButtonObserver = new MutationObserver(mutations => {
        const submitButton = document.getElementById("save_master_button");
        if (!submitButton || submitButton.style.display === "none") {
            return;
        }

        submitButton.style.display = "none";

        let submitInstructions = submitButton.parentElement.querySelector("span");
        if (!submitInstructions) {
            submitInstructions = document.createElement("span");
            submitInstructions.textContent = "Use approval button in automator menu";

            submitButton.parentNode.appendChild(submitInstructions);
        }
    });
    submitButtonObserver.observe(document.body, {childList: true, subtree: true});

    // Step 3: Wait for preview to appear
    await waitForElement("div#object_preview > h3");

    // Step 4: Wait for approval
    const approvalActions = [
        {label: "Approve", value: "approve"},
        {label: "Cancel", value: "cancel"},
    ];
    const approvalChoice = await logAction(
        "Please review preview and approve or cancel:",
        approvalActions).promise;

    // Regardless of choice, unhide the submit button, and remove the automator instructions
    submitButtonObserver.disconnect();

    const submitButton = document.getElementById("save_master_button");
    submitButton.style.removeProperty("display");

    const submitInstructions = submitButton.parentElement.querySelector("span");
    submitInstructions?.remove();

    if (approvalChoice !== approvalActions[0].value) {
        fail("Submission cancelled by user");
        return;
    }

    // Step 3: Click submit
    submitButton.click();
}

// ACTION HANDLERS /////////////////////////////////////////////////////////

function isCreateMasterReleaseEnabled() {
    return window.location.href.match(/\/artist\/\d+(-[^\/]+)+$/)
}

function isDuplicateAsDigitalEnabled() {
    if (!window.location.href.match(/\/release\/\d+(-[^\/]+)+$/)) {
        return false;
    }

    let releaseActionsDiv = document.querySelector("section#release-actions > div");
    return !releaseActionsDiv || !releaseActionsDiv.textContent.includes("Draft");
}

async function handleCreateMasterRelease(stateObject) {
    // noinspection FallThroughInSwitchStatementJS
    switch (stateObject.stateId) {
        case undefined:
            // In this state, we will allow the user to select releases that should be added to the
            // master release.

            // Initialize state
            stateObject.stateId = 0;
            stateObject.selectedReleaseIds = [];

        case 0:
            let discoObserver;
            const drawCheckboxes = function() {
                // Draw checkboxes in the skittles column of the table
                const skittleCells = document.querySelectorAll("td[class^=skittles]");
                for (let cell of skittleCells) {
                    // Find existing checkboxes and remove them
                    cell.querySelectorAll("input")
                        .forEach(cb => cb.remove());

                    // Hide any remaining elements in the cell
                    cell.childNodes
                        .forEach(c => c.style["display"] = "none");

                    // If row is for a master release, just skip over it
                    const rowParent = cell.parentNode;
                    const releaseHref = rowParent.querySelector("td:nth-child(3) > a")?.href
                    if (!releaseHref) {
                        continue;
                    }

                    // This is a regular release, extract the release ID for it
                    const releaseIdMatch = releaseHref.match(/\/([a-z]+)\/(\d+)(-[^\/]+)+$/);
                    if (!releaseIdMatch || releaseIdMatch[1] !== "release") {
                        continue;
                    }
                    const releaseId = releaseIdMatch[2];

                    // Create checkbox with release ID as value
                    const checkbox = document.createElement("input");
                    checkbox.setAttribute("type", "checkbox");
                    checkbox.setAttribute("value", releaseId);
                    checkbox.onclick = () => {
                        const index = stateObject.selectedReleaseIds.indexOf(releaseId);
                        if (index >= 0) {
                            stateObject.selectedReleaseIds = stateObject.selectedReleaseIds.splice(index, 1);
                        } else {
                            stateObject.selectedReleaseIds.push(releaseId);
                        }

                        storeState(CreateMasterReleaseId, stateObject);
                    }

                    // Check the checkbox if it was already checked
                    if (stateObject.selectedReleaseIds.indexOf(releaseId) >= 0) {
                        checkbox.setAttribute("checked", "checked");
                    }

                    cell.appendChild(checkbox);
                }

                // Setup an observer to redraw the checkboxes if the releases table changes
                const discographyGrid = document.querySelector("div[class^=discographyGrid_]");
                if (!discographyGrid) {
                    fail("Could not find discography grid");
                }

                let discoObserverDebouncer;
                discoObserver = new MutationObserver(mutations => {
                    // Ignore if the one of the mutations removed the releases table
                    // When the table is removed, this indicates that the loading screen has been replaced.
                    // When the table is added back, we can restart the debounce timer
                    const mutationsRemovedTable = mutations.find(m => {
                        if (m.removedNodes.length !== 1) { return false; }
                        const removedNode = m.removedNodes.item(0);
                        return removedNode.tagName === "TABLE" && removedNode.className.startsWith("releases_");
                    });
                    if (mutationsRemovedTable) {
                        return;
                    }

                    // Clear the existing timeout to debounce
                    clearTimeout(discoObserverDebouncer);

                    // Set a new timeout to call the function after 30ms
                    discoObserverDebouncer = setTimeout(() => {
                        discoObserver.disconnect(); // Important otherwise we get an infinite loop
                        drawCheckboxes();
                    }, 30);
                });
                discoObserver.observe(discographyGrid, {childList: true, subtree: true});
            }

            // Draw the checkboxes for what is visible right now
            drawCheckboxes();

            // When finished, allow user to move to next step or finish
            let selectionFinishedActions = [
                {label: "Create Master Release", value: "approve"},
                {label: "Cancel", value: "cancel"}
            ];
            let selectionFinishedChoice = await logAction(
                "Select releases, when finished click Create Master Release:",
                selectionFinishedActions
            ).promise;
            if (selectionFinishedChoice !== selectionFinishedActions[0].value) {
                // Disconnect the observer
                discoObserver?.disconnect();

                // User cancelled, clear checkboxes
                const skittleCells = document.querySelectorAll("td[class^=skittles]");
                for (let cell of skittleCells) {
                    cell.querySelectorAll("input").forEach(cb => cb.remove());
                    cell.childNodes.forEach(c => c.style.removeProperty("display"));
                }

                // Reset state
                clearState();
                beginMenu(false);
                return;
            }

            // Move to next step, creating the master release
            stateObject.stateId++;
            storeState(CreateMasterReleaseId, stateObject);
            window.location.href = "https://www.discogs.com/master/create";

            break;

        case 1:
            // In this state, we create the master release
            await delay(1000);

            stateObject.stateId++;
            storeState(CreateMasterReleaseId, stateObject);

            await setReleasesForMaster(stateObject.selectedReleaseIds);

            break;

        case 2:
            logMessage("Completed creation of master release");
            clearState();

            beginMenu(true);
            return;

        default:
            fail(`State ${stateObject.stateId} is not supported for ${CreateMasterReleaseId}`);
            return;
    }
}

async function handleDuplicateAsDigital(actionId, stateObject, format) {
    switch (stateObject.stateId) {
        case undefined:
            // Initialize state
            stateObject.stateId = 0;

            // Determine if release has a master release
            let masterLink = document.querySelector("a[href^='/master/']");
            if (masterLink) {
                let masterIdMatch = masterLink.href.match(/\/master\/(\d+)-/);
                stateObject.masterId = masterIdMatch ? masterIdMatch[1] : undefined;
            }

            // Find the edit release link
            let editReleaseLink = document.querySelector("a[href^='/release/'][href$='history#latest']");
            if (!editReleaseLink) {
                fail("Edit release link cannot be found");
                return;
            }

            // Extract the original release ID
            let originalUrlReleaseMatch = window.location.href.match(/\/release\/(\d+)-?/)
            if (!originalUrlReleaseMatch) {
                fail("Release page URL does not match expected format, cannot extract release ID");
                return;
            }

            stateObject.originalId = originalUrlReleaseMatch[1];

            // Extract the name of the release to figure out what the draft name should look like
            let titleElement = document.querySelector("h1");
            let labelElement = document.querySelector("div[class^=info] > table > tbody > tr > td");
            if (!titleElement || !labelElement) {
                fail("Could not find title or label elements, cannot extract expected draft name");
                return;
            }

            let labelStrings = labelElement.textContent.split(',')
                .map((i) => i.split("–")[0].trim())
                .join(", ");

            stateObject.expectedDraftName = `${titleElement.textContent} — ${labelStrings}`;

            // Set the state and go to the exit release page
            storeState(actionId, stateObject);
            editReleaseLink.click();

            break;

        case 0:
            logMessage("Copying release to draft...");

            // We're on the release history page, we need to click copy to draft
            if (!window.location.href.match(/\/release\/.+\/history#latest/)) {
                fail("Current page does not align with current state");
                return;
            }

            // Find copy to draft link
            let copyToDraftLink = document.querySelector("a[href^='/release/copy/']");
            if (!copyToDraftLink) {
                fail("Copy to draft link cannot be found");
                return;
            }

            // Redirect to copy to draft link
            stateObject.stateId++;
            storeState(actionId, stateObject);
            window.location.href = copyToDraftLink.href;

            break;

        case 1:
            logMessage("Redirecting to draft edit page...");

            // We're on the drafts page, we need to redirect to the copy page
            if (!window.location.href.endsWith("/users/drafts")) {
                fail("Current state expects to be on drafts page, which is false.");
                return;
            }

            // Find link to draft
            let firstDraftRow = document.querySelector("table > tbody > tr");
            if (!firstDraftRow) {
                fail("Could not find draft row item");
                return;
            }

            let firstDraftTitleCell = firstDraftRow.querySelector(":nth-child(1)")
            if (!firstDraftTitleCell) {
                fail("Could not find title cell in the draft table");
                return;
            }

            let firstDraftTitle = firstDraftTitleCell.textContent.replaceAll(/\s+/g, " ").trim();
            if (firstDraftTitle !== stateObject.expectedDraftName) {
                fail(`Expected '${stateObject.expectedDraftName}' as first draft item, got '${firstDraftTitle}'`);
                return;
            }

            // Find link to edit
            let firstDraftLink = firstDraftRow.querySelector(":nth-child(2) > a");
            if (!firstDraftLink) {
                fail("Could not find edit/submit link for first draft item");
                return;
            }

            // Redirect to edit page
            stateObject.stateId++;
            storeState(actionId, stateObject);
            window.location.href = firstDraftLink.href;

            break;

        case 2:
            logMessage("Waiting for edit page to load...");

            if (!window.location.href.match(/\/release\/edit\//)) {
                fail("Current state expects to be on draft editing page, which is false.");
                return;
            }

            // Edit page does a "loading" screen, so wait for it to load
            await waitForElement("div.subform_table");

            // Step 1: Wait for image to be uploaded. Image uploading cannot be automated ...
            let waitForImageSkip = logAction(
                "Waiting for image to be uploaded... Click to skip.",
                [{label: "Skip", value: undefined}]
            );
            let waitForImageElement = waitForElement("li.image_preview")
                .then(() => waitForImageSkip.reject());
            await Promise.any([waitForImageElement, waitForImageSkip.promise]);

            // Step 2: Find any barcodes and remove them
            logMessage("Removing barcodes...");
            let barcodes = document.querySelectorAll("li[data-path^='/barcodes/']");
            if (barcodes) {
                for (const barcodeLi of barcodes) {
                    let barcodeType = barcodeLi.querySelector("select");
                    if (barcodeType.value !== "barcode") {
                        continue;
                    }

                    // Entry is a barcode, delete it (B/C DIFFERENT SKUs SHOULD HAVE DIFFERENT
                    // BARCODES, AND I HAVE NO IDEA WHERE PEOPLE GET THESE BARCODES FROM)
                    let barcodeRemoveButton = barcodeLi.querySelector("button[aria-label='Remove']");
                    if (!barcodeRemoveButton) {
                        console.warn("Could not find barcode remove button.");
                        continue;
                    }

                    barcodeRemoveButton.click();
                }
            }

            // Step 3: Find the formats and change them
            logMessage("Changing format...");
            let formats = document.querySelectorAll("li[data-path^='/format/']");
            if (formats.length === 0) {
                fail("Could not find format elements");
                return;
            }

            if (formats.length > 1) {
                // @TODO: Allow duplicating split releases
                fail("Too many formats to automate safely.");
                return;
            }

            const formatFormElement = formats[0]

            let formatTypeSelector = formatFormElement.querySelector("select");
            if (!formatTypeSelector || formatTypeSelector.value !== "File") {
                // @TODO: Allow duplicating of CD/Vinyl
                fail("Release is not a file. Cannot safely automate.");
                return;
            }

            // Step 3.1: Uncheck any selected file types
            let selectedFileTypes = formatFormElement.querySelectorAll("input[id*='File Type'][checked]");
            for (const selectedFileType of selectedFileTypes) {
                selectedFileType.click();
            }

            // Step 3.2: Check WAV file type
            let desiredFileType = format.toUpperCase();
            let wavCheckbox = formatFormElement.querySelector(`input[value='${desiredFileType}']`);
            if (!wavCheckbox) {
                fail("Could not find WAV file type");
                return;
            }
            wavCheckbox.click();

            // Step 3.3: Clear free text field
            // @TODO: Request format for FLAC
            let freeTextInput = formatFormElement.querySelector("input[aria-label='free text field']");
            if (!freeTextInput) {
                fail("Could not find free text field");
                return;
            }
            freeTextInput.value = "";
            freeTextInput.dispatchEvent(new Event("input", {bubbles: true}));
            freeTextInput.dispatchEvent(new Event("blur", {bubbles: true}));

            // Step 4: Make a single if there's only one track in it (I DON'T CARE ANYMORE)
            let tracks = document.querySelector("tr[data-path^='/tracks/0']");
            let isSingle = tracks.length === 1;
            if (isSingle) {
                let singleCheckbox = formatFormElement.querySelector("input[id*='Description'][value='Single']");
                if (singleCheckbox && !singleCheckbox.checked) {
                    singleCheckbox.click();
                }
            }

            // Step 5: Set the submission notes
            logMessage("Setting submission notes...");
            let submissionNotesElement = document.querySelector("textarea#release-submission-notes-textarea");
            if (!submissionNotesElement) {
                fail("Could not find Submission Notes");
                return;
            }
            let referenceUrl = await logInput("Input reference URL:").promise;
            if (!referenceUrl) {
                fail("Reference URL not provided");
                return;
            }
            let submissionNotesValue = `Adding ${format} version: ${referenceUrl}`;
            submissionNotesElement.value = submissionNotesValue;
            submissionNotesElement.dispatchEvent(new Event("input", {bubbles: true}));
            submissionNotesElement.dispatchEvent(new Event("blur", {bubbles: true}));

            // Step 6: Click preview/submit
            let releasePreviewButton = document.querySelector("button.preview");
            if (!releasePreviewButton) {
                fail("Could not find preview/submit button");
                return;
            }
            releasePreviewButton.click();

            logMessage("Waiting for preview...");
            await waitForElement("div#subform_preview");

            // Step 7: Preliminary check
            logMessage("Running preliminary check...");
            let previewSummaryElements = document.querySelectorAll("div#subform_preview > div.body > div.profile > div");
            let previewFormatElement = (Array(...previewSummaryElements)).find(d => d.textContent.startsWith("Format"));
            if (!previewFormatElement || !previewFormatElement.textContent.includes(`File, ${desiredFileType}`)) {
                fail("Format failed preliminary check");
                return;
            }

            let previewSubmissionNotes = document.querySelector("div.subform_submission_notes > blockquote");
            if (!previewSubmissionNotes || previewSubmissionNotes.textContent !== submissionNotesValue) {
                fail("Submission notes failed preliminary check");
                return;
            }

            // Step 8: Wait for approval
            // Step 8.1: Hide the submit button to force people to use the approval button
            let submitButton = document.querySelector("div#subform_submit > table > tbody > tr > td > button");
            submitButton.style.display = "none";

            let submitInstructions = document.createElement("span");
            submitInstructions.textContent = "Use approval button in automator menu";
            submitButton.parentElement.appendChild(submitInstructions);

            // Step 8.2: Wait for user to approve it
            let releaseApprovalActions = [
                {label: "Approve", value: "approve"},
                {label: "Reject", value: "reject"}
            ];
            let releaseApprovalChoice = await logAction("Please review preview and approve or reject:", releaseApprovalActions).promise;

            // Step 8.3: Regardless of choice, show the submit button and remove instructions
            submitInstructions.remove();
            submitButton.style.removeProperty("display");

            if (releaseApprovalChoice !== releaseApprovalActions[0].value) {
                fail("Submission cancelled by user.");
                return;
            }

            // Step 9: Click submit
            logMessage("Submitting release...");
            stateObject.stateId++;
            storeState(actionId, stateObject);

            submitButton.click();

            break;

        case 3:
            logMessage("Determining new release ID")

            let newReleaseUrlMatch = window.location.href.match(/\/release\/(\d+)-?/)
            if (!newReleaseUrlMatch) {
                fail("Release page URL does not match expected format, cannot extract release ID");
                return;
            }

            stateObject.newId = newReleaseUrlMatch[1];
            stateObject.stateId++;
            storeState(actionId, stateObject)

            window.location.href = stateObject.masterId
                ? `https://www.discogs.com/master/edit/${stateObject.masterId}`
                : `https://www.discogs.com/master/create`;

            break;

        case 4:
            // Update or create the master release
            await delay(1000);

            stateObject.stateId++;
            storeState(actionId, stateObject);

            if (stateObject.masterId) {
                // Master release exists, add to the current one (and make it the key release)
                // @TODO: Use some logic for determining if the release should be key. Vinyl should always be higher ranked.
                await addReleaseToMaster(stateObject.newId, true);
            } else {
                // Master release does not exist, create new one (and make it the key release)
                await setReleasesForMaster([stateObject.newId, stateObject.originalId], stateObject.newId);
            }

            break;

        case 5:
            logMessage("Completed duplicate as digital");
            clearState();

            beginMenu(true);
            break;

        default:
            fail(`State ${stateObject.stateId} is not supported for '${actionId}'`);
            return;
    }
}

function handleDuplicateAsFlac(stateObject) {
    return handleDuplicateAsDigital(DuplicateAsFlac, stateObject, "flac");
}

function handleDuplicateAsWav(stateObject) {
    return handleDuplicateAsDigital(DuplicateAsWav, stateObject, "wav");
}

async function handleTest(actionId, stateObject) {
    if (stateObject.reloaded){
        logMessage("Baz!");
        fail("DYING!");
        return;
    }

    logMessage("Foo!");
    logMessage("Bar!");
    logMessage(actionId);
    storeState("Test", {reloaded: true});

    window.location.reload();
}

// MENU CODE ///////////////////////////////////////////////////////////////

const MenuItems = {};
MenuItems[CreateMasterReleaseId] = {
    action: handleCreateMasterRelease,
    isEnabled: isCreateMasterReleaseEnabled,
    icon: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path d=\"M0 0h24v24H0z\" fill=\"none\"/><path d=\"M17.21 9l-4.38-6.56c-.19-.28-.51-.42-.83-.42-.32 0-.64.14-.83.43L6.79 9H2c-.55 0-1 .45-1 1 0 .09.01.18.04.27l2.54 9.27c.23.84 1 1.46 1.92 1.46h13c.92 0 1.69-.62 1.93-1.46l2.54-9.27L23 10c0-.55-.45-1-1-1h-4.79zM9 9l3-4.4L15 9H9zm3 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z\"/></svg>",
    text: "Create Master Release"
};
MenuItems[DuplicateAsFlac] = {
    action: handleDuplicateAsFlac,
    isEnabled: isDuplicateAsDigitalEnabled,
    icon: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path d=\"M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z\"/></svg>",
    text: "Duplicate As FLAC"
};
MenuItems[DuplicateAsWav] = {
    action: handleDuplicateAsWav,
    isEnabled: isDuplicateAsDigitalEnabled,
    icon: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\"><path d=\"M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z\"/></svg>",
    text: "Duplicate As WAV"
};
MenuItems["Test"] = {
    action: handleTest,
    isEnabled: () => true,
    icon: IconExclamation,
    text: "Test"
};

function beginAction(action, stateObject = {}, currentLogEntries = []) {
    clearUi();

    // Draw the motorcycle icon
    let motorcycleIcon = document.createElement("div");
    motorcycleIcon.id = "automator-icon";
    motorcycleIcon.style.backgroundColor = "darkolivegreen";
    motorcycleIcon.innerHTML = IconMotorcycle;

    document.body.appendChild(motorcycleIcon);

    // Draw the log container
    let logContainer = document.createElement("div");
    logContainer.id = "automator-container";

    document.body.appendChild(logContainer);

    for (const logEntry of currentLogEntries) {
        logMessage(logEntry);
    }

    // Start the action
    action(stateObject);
}

function beginLoggedOut() {
    clearUi();

    // Draw the menu icon logged out
    let loggedOutIcon = document.createElement("div");
    loggedOutIcon.id = "automator-icon";
    loggedOutIcon.style.backgroundColor = "darkred";
    loggedOutIcon.innerHTML = IconExtension;

    loggedOutIcon.title = "Automator disabled when logged out";

    document.body.appendChild(loggedOutIcon);
}

function beginMenu(leaveLog = false) {
    clearUi(leaveLog);

    // Draw the menu icon
    let menuIcon = document.createElement("div");
    menuIcon.id = "automator-icon";
    menuIcon.classList.add("clickable");
    menuIcon.style.backgroundColor = "darkolivegreen";
    menuIcon.innerHTML = IconExtension;

    menuIcon.onclick = toggleMenu;

    document.body.appendChild(menuIcon);
}

function clearUi(leaveContainer = false) {
    let icon = document.getElementById("automator-icon");
    if (icon) {
        icon.remove();
    }

    if (!leaveContainer) {
        let container = document.getElementById("automator-container");
        if (container) {
            container.remove();
        }
    }
}

function fail(message) {
    // Add to log
    let action = {label: "Clear State", value: "clearState"};
    logAction(message, [action], IconExclamation).promise
        .then(() => {
            clearState();
            beginMenu(false);
        });
}

function logAction(message, actions, icon=undefined) {
    let messageEntry = logMessage(message, icon);
    if (!messageEntry) {
        return;
    }
    let container = messageEntry.parentElement;

    // Setup row for action buttons
    let buttonEntry = document.createElement("div");
    buttonEntry.classList.add("automator-container-entry");
    buttonEntry.classList.add("automator-container-entry-text");
    buttonEntry.style.textAlign = "right";

    // Setup the button promise
    let resolve;
    let reject;
    let buttonPromise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    }).then(
        value => {
            if (!value) {
                console.warn("Promise resolved with undefined");
                return undefined;
            }

            messageEntry.remove();
            buttonEntry.remove();
            return value;
        },
        () => {
            messageEntry.remove();
            buttonEntry.remove();
            return undefined;
        }
    );

    // Add buttons to the action button row
    for (const action of actions) {
        let buttonElement = document.createElement("button");
        buttonElement.textContent = action.label;
        buttonElement.onclick = () => { resolve(action.value); }

        buttonEntry.appendChild(buttonElement);
    }

    container.appendChild(buttonEntry);

    return {
        promise: buttonPromise,
        resolve: resolve,
        reject: reject
    };
}

function logInput(message) {
    let messageEntry = logMessage(message);
    if (!messageEntry) {
        return;
    }
    let container = messageEntry.parentElement;


    // Display input field, ok/cancel buttons
    let inputEntry = document.createElement("div");
    inputEntry.classList.add("automator-container-entry");
    inputEntry.classList.add("automator-container-entry-text")
    inputEntry.style.textAlign = "right";

    let inputElement = document.createElement("input");
    inputElement.type = "text";
    inputEntry.appendChild(inputElement);

    let okElement = document.createElement("button");
    okElement.textContent = "OK";
    inputEntry.appendChild(okElement);

    let cancelElement = document.createElement("button");
    cancelElement.textContent = "Cancel";
    inputEntry.appendChild(cancelElement);

    // Setup the submit/cancel promise
    let resolve;
    let reject;
    let inputPromise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    }).then(
        value => {
            messageEntry.remove();
            inputEntry.remove();
            return value;
        },
        () => {
            messageEntry.remove();
            inputEntry.remove();
            return undefined;
        }
    );

    okElement.onclick = () => {
        let value = inputElement.value;
        inputEntry.textContent = `Submitted: ${value}`;
        resolve(value);
    };

    cancelElement.onclick = () => {
        inputEntry.textContent = `Cancelled`;
        resolve(undefined);
    }

    container.appendChild(inputEntry);

    return {
        promise: inputPromise,
        resolve: resolve,
        reject: reject
    };
}

function logMessage(message, icon = undefined) {
    let container = document.getElementById("automator-container");
    if (!container) {
        console.error("Automator container not found");
        return undefined;
    }

    // Create entry
    let logEntry = document.createElement("div");
    logEntry.className = "automator-container-entry";

    // Add icon if provided
    if (icon) {
        let iconEntry = document.createElement("div");
        iconEntry.className = "automator-container-entry-icon";
        iconEntry.innerHTML = icon;

        logEntry.appendChild(iconEntry);
    }

    // Add message
    let messageEntry = document.createElement("div");
    messageEntry.className = "automator-container-entry-text";
    messageEntry.textContent = message;

    logEntry.appendChild(messageEntry);

    container.appendChild(logEntry);

    return logEntry;
}

function toggleMenu() {
    let menuContainer = document.getElementById("automator-container");
    if (menuContainer) {
        // Menu visible, delete it
        menuContainer.remove();
    } else {
        // Menu not visible, draw it
        menuContainer = document.createElement('div');
        menuContainer.id = "automator-container";

        // Draw menu items
        let menuItemsDrawn = 0;
        for (const menuItemId in MenuItems) {
            let menuItem = MenuItems[menuItemId];
            if (menuItem.isEnabled()) {
                let menuItemContainer = document.createElement("div");
                menuItemContainer.classList.add("automator-container-entry");
                menuItemContainer.classList.add("clickable");
                menuItemContainer.onclick = () => beginAction(menuItem.action);

                let menuItemIcon = document.createElement("div");
                menuItemIcon.innerHTML = menuItem.icon;
                menuItemIcon.className = "automator-container-entry-icon";
                menuItemContainer.appendChild(menuItemIcon);

                let menuItemText = document.createElement("div");
                menuItemText.textContent = menuItem.text;
                menuItemText.className = "automator-container-entry-text";
                menuItemContainer.appendChild(menuItemText);

                menuContainer.appendChild(menuItemContainer);
                menuItemsDrawn++;
            }
        }

        if (menuItemsDrawn === 0) {
            let noActionsAvailable = document.createElement('div');
            noActionsAvailable.textContent = "No actions available for this page";
            menuContainer.appendChild(noActionsAvailable);
        }

        document.body.appendChild(menuContainer);
    }
}

// MAIN ////////////////////////////////////////////////////////////////////

(async function() {
    'use strict'

    // Setup styles
    let style = document.createElement('style');
    style.appendChild(document.createTextNode(AutomatorStyle));
    document.getElementsByTagName('head')[0].appendChild(style);

    // Determine if user is logged in
    let loggedInButton = document.querySelector('button[aria-label^="Logged in as"]');
    if (!loggedInButton) {
        beginLoggedOut();
        return;
    }

    // Determine if an action is in progress
    let stateString = localStorage.getItem(AutomatorLocalStorageKey);
    if (!stateString) {
        beginMenu();
        return;
    }

    // Restore the state and continue
    let stateObject;
    try {
        stateObject = JSON.parse(stateString);
    } catch {
        alert("State is bcrupted.");
        clearState();
        beginMenu();
    }

    let menuItem = MenuItems[stateObject.actionId];
    if (!menuItem) {
        alert(`State points to invalid action ${stateObject.actionId}`);
        clearState();
        beginMenu();
    }

    beginAction(menuItem.action, stateObject.actionState, stateObject.logEntries);
    beginMenu(true);
})();
