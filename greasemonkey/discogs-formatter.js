// ==UserScript==
// @name        Discogs Formatter
// @namespace   http://renbussell.com
// @version     1.0
// @description A script for formatting various pages on Discogs in a friendlier manner
// @author      Ben Russell (github.com/benrr101)
// @match       https://*.discogs.com/*
// @grant       none
// ==/UserScript==

// UTILITY METHODS /////////////////////////////////////////////////////////
function renderSection(siblingSection, sectionName, contentFunc) {
    const siblingSectionDiv = siblingSection.parentElement;
    const siblingHeader = siblingSection.querySelector("header");
    const siblingHeaderH2 = siblingHeader.querySelector("h2 > span");
    const siblingContentDiv = siblingSection.querySelector("div");

    // 1) <div>
    const sectionDiv = document.createElement("div");
    siblingSectionDiv.parentElement.insertBefore(sectionDiv, siblingSectionDiv);

    sectionDiv.className = siblingSectionDiv.className;

    // 1.1) <section>
    const section = document.createElement("section");
    sectionDiv.appendChild(section);

    section.id = "variant-identifiers";
    section.className = siblingSection.className;

    // 1.1.1) <header>
    const sectionHeader = document.createElement("header");
    section.appendChild(sectionHeader)

    sectionHeader.className = siblingHeader?.className;

    // 1.1.1.1) <h2>
    const h2 = document.createElement("h2");
    sectionHeader.appendChild(h2);

    h2.className = siblingHeaderH2?.className;
    h2.style.fontSize = "18px";
    h2.textContent = sectionName;

    // 1.1.2) <div>
    const sectionContentDiv = document.createElement("div");
    section.appendChild(sectionContentDiv);

    sectionContentDiv.className = siblingContentDiv?.className;

    // 1.1.2.x) Contents
    contentFunc(sectionContentDiv);
}

// PAGE HANDLERS ///////////////////////////////////////////////////////////
function handleReleasePage() {
    window.addEventListener('load', () => {
        handleReleasePageMatrixBarcodeReady();
    });
}

function handleReleasePageMatrixBarcodeReady() {
    // 1) Find all rows of the matrix/barcodes
    const barcodeSection = document.querySelector('section#release-barcodes');
    if (!barcodeSection) {
        return;
    }

    const items = barcodeSection.querySelectorAll('li span');
    if (!items.length) {
        return;
    }

    // 2) Parse items into an array of variants
    const generalItems = [];
    const variantObjectMap = new Map();
    const variantColumns = new Set();
    for (let item of items) {
        // Split item into field and value
        const itemSplit = item.textContent.split(": ").map(s => s.trim());
        if (itemSplit < 0) {
            continue;
        }

        const rawLabel = itemSplit[0];
        const rawValue = itemSplit.slice(1).join(": ");

        // Determine which variants this item applies to

        // Case 0: Not a variant
        const variantMatch = rawLabel.match(/(.+)(\(Variant.+?\))/i);
        if (!variantMatch) {
            // This doesn't have a variant in the label, throw it into the general bin
            generalItems.push({ label: rawLabel, value: rawValue });
            continue;
        }

        const variantString = variantMatch[2];

        // @TODO: Handle "All Variants"

        // Case 1: 1, 1-3, etc
        const foundVariants = new Set();
        const variantIdMatches = variantString.match(/(\d+\s*-\*\d+|\d+)/g)
        if (!variantIdMatches) {
            // This item doesn't have any specified variants
            generalItems.push({ label: rawLabel, value: rawValue});
            continue;
        }

        for (const variantIdMatch of variantIdMatches) {
            const variantRangeMatch = variantIdMatch.match(/(\d+)\s*-\s*(\d+)/);
            if (variantRangeMatch) {
                // Case 1.1: Ranges like 1-3
                const lowerBound = parseInt(variantRangeMatch[1]);
                const upperBound = parseInt(variantRangeMatch[2]);
                for (let i = lowerBound; i <= upperBound; i++) {
                    foundVariants.add(i.toString());
                }
            } else {
                // Case 1.2: Exact numbers
                foundVariants.add(variantIdMatch);
            }
        }

        // Parse the label to remove variant
        // @TODO: Handle "Matrix / Runout (Variant 1, 2, 3, blah blah blah)" into "Matrix / Runout (blah blah blah)"
        const label = variantMatch[1].trim();
        variantColumns.add(label);

        // Find the variant to add this field to
        for (const variantId of foundVariants) {
            let variantObject = variantObjectMap.get(variantId);
            if (!variantObject) {
                // Create and store new variant object
                variantObject = {};
                variantObjectMap.set(variantId, variantObject);
            }

            // Set the value on the variant
            if (variantObject[label]) {
                variantObject[label].push(rawValue);
            } else {
                variantObject[label] = [rawValue];
            }
        }
    }

    // 3) Render a table of variants
    if (variantObjectMap.size > 0) {
        renderSection(barcodeSection, "Variant Identifiers", sectionContentDiv => {
            // 1) <table>
            const table = document.createElement("table");
            sectionContentDiv.appendChild(table);

            // 1.1) <tr>
            const tableHeaderRow = document.createElement("tr");
            table.appendChild(tableHeaderRow);

            // 1.1.1) <td>
            const variantColumnHeaderCell = document.createElement("td");
            tableHeaderRow.appendChild(variantColumnHeaderCell);

            variantColumnHeaderCell.style.fontWeight = "bold";
            variantColumnHeaderCell.textContent = "Variant";

            // 1.1.x) <td>
            variantColumns.forEach(column => {
                const cell = document.createElement("td");
                tableHeaderRow.appendChild(cell);

                cell.style.fontWeight = "bold";
                cell.textContent = column;
            });

            // 1.x) <tr>
            Array.from(variantObjectMap.entries())
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .forEach(([variantId, variantObj]) => {
                    const tableBodyRow = document.createElement("tr");
                    table.appendChild(tableBodyRow);

                    // 1.x.1) <td>
                    tableBodyRow.insertCell().textContent = `Variant ${variantId}`;

                    //1.x.y) <td>
                    variantColumns.forEach(col => {
                        const cell = document.createElement("td");
                        tableBodyRow.appendChild(cell);

                        cell.style.fontFamily = "\"Consolas\", \"Courier New\", Courier, monospace";

                        if (variantObj[col]) {
                            for (let i = 0; i < variantObj[col].length; i++) {
                                cell.appendChild(document.createTextNode(variantObj[col][i]));
                                if (i < variantObj[col].length - 1) {
                                    cell.appendChild(document.createElement("br"));
                                }
                            }
                        } else {
                            cell.textContent = "-";
                        }
                    });
                });
        });
    }

    // 4) Render the other identifiers
    if (generalItems.length > 0) {
        renderSection(barcodeSection, "Other Identifiers", sectionContentDiv => {
            // 1) <table>
            const table = document.createElement("table");
            sectionContentDiv.appendChild(table);

            // 1.x) <tr>
            generalItems
                .sort((a, b) => a.label - b.label)
                .forEach(generalItemObj => {
                    // 1.x <tr>
                    const tableBodyRow = document.createElement("tr");
                    table.appendChild(tableBodyRow);

                    // 1.x.1) <td>{label}</td>
                    const labelCell = document.createElement("td");
                    tableBodyRow.appendChild(labelCell);

                    labelCell.style.fontWeight = "bold";
                    labelCell.style.width = "33%";
                    labelCell.textContent = generalItemObj.label;

                    // 1.x.2) <td>{value}</td>
                    const valueCell = document.createElement("td");
                    tableBodyRow.appendChild(valueCell);

                    valueCell.style.fontFamily = "\"Consolas\", \"Courier New\", Courier, monospace";
                    valueCell.style.width = "67%";
                    valueCell.textContent = generalItemObj.value;
                });
        });
    }

    // 5) Hide content of the original section
    const barcodeSectionContentDiv = barcodeSection.querySelector("div");
    if (barcodeSectionContentDiv) {
        // 5.1) Hide content
        barcodeSectionContentDiv.style.display = "none";

        // 5.2) Add button to enable showing original content
        const toggleA = document.createElement("a");
        barcodeSection.querySelector("h2")?.appendChild(toggleA);

        toggleA.style.float = "right";
        toggleA.textContent = "(+)";

        toggleA.onclick = () => {
            if (barcodeSectionContentDiv.style.display === "none") {
                // Show it
                barcodeSectionContentDiv.style.display = "block";
                toggleA.textContent = "(-)";
            } else {
                // Hide it
                barcodeSectionContentDiv.style.display = "none";
                toggleA.textContent = "(+)";
            }
        }
    }
}

// MAIN ////////////////////////////////////////////////////////////////////
(async function() {
    'use strict'

    if (window.location.href.match(/\/release\/\d+(-[^\/]+)+$/)) {
        handleReleasePage();
    }
})();
