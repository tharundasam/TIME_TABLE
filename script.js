/* ============================================
   COLLEGE TIMETABLE GENERATION SYSTEM v6.0
   FIXED: Smart distribution, one lab per day, interactive dashboard
   ============================================ */

const PERIODS = [
    "9:00-10:00", "10:00-11:00", "11:00-12:00", "LUNCH",
    "12:30-1:30", "1:30-2:20", "2:20-3:10", "3:10-4:00"
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TEACHING_PERIODS = [0, 1, 2, 4, 5, 6, 7];

const LAB_SLOTS = {
    MORNING: [0, 1, 2],
    AFTERNOON: [5, 6, 7]
};

let globalState = {
    sections: [],
    facultyData: {},
    totalDays: 6,
    totalRooms: 10,
    sectionLabDays: {} // Track which days have labs per section
};

/* ============================================
   CONSTRAINT FUNCTIONS
   ============================================ */

function isFacultyBusy(facultyName, day, period) {
    if (!globalState.facultyData[facultyName]) return false;
    return globalState.facultyData[facultyName].schedule[day]?.[period] !== undefined;
}

function markFacultyBusy(facultyName, day, period, sectionId, subjectName, type, roomNumber) {
    if (!globalState.facultyData[facultyName]) {
        globalState.facultyData[facultyName] = {
            schedule: {},
            assignments: [],
            sectionsHandled: new Set(),
            totalPeriods: 0,
            labPeriods: 0,
            theoryPeriods: 0,
            dailyLoad: {},
            subjectsPerSection: {},
            workloadByDay: {}
        };
    }

    if (!globalState.facultyData[facultyName].schedule[day]) {
        globalState.facultyData[facultyName].schedule[day] = {};
    }

    globalState.facultyData[facultyName].schedule[day][period] = {
        section: sectionId,
        subject: subjectName,
        type: type,
        room: roomNumber
    };

    globalState.facultyData[facultyName].assignments.push({
        day: day,
        period: period,
        section: sectionId,
        subject: subjectName,
        type: type,
        room: roomNumber
    });

    globalState.facultyData[facultyName].sectionsHandled.add(sectionId);
    globalState.facultyData[facultyName].totalPeriods++;
    
    if (type === 'lab') {
        globalState.facultyData[facultyName].labPeriods++;
    } else {
        globalState.facultyData[facultyName].theoryPeriods++;
    }

    if (!globalState.facultyData[facultyName].dailyLoad[day]) {
        globalState.facultyData[facultyName].dailyLoad[day] = 0;
    }
    globalState.facultyData[facultyName].dailyLoad[day]++;

    if (!globalState.facultyData[facultyName].workloadByDay[day]) {
        globalState.facultyData[facultyName].workloadByDay[day] = [];
    }
    globalState.facultyData[facultyName].workloadByDay[day].push({
        subject: subjectName,
        section: sectionId,
        period: period
    });
}

function isSlotAvailable(timetable, day, period) {
    return timetable[day][period] === null;
}

function hasLabAlreadyOnDay(sectionId, day) {
    const key = `${sectionId}-${day}`;
    return globalState.sectionLabDays[key] === true;
}

function markLabOnDay(sectionId, day) {
    const key = `${sectionId}-${day}`;
    globalState.sectionLabDays[key] = true;
}

function canPlaceLabAtSlot(timetable, faculty, day, slotArray, sectionId) {
    // Check if section already has lab on this day
    if (hasLabAlreadyOnDay(sectionId, day)) {
        return false;
    }

    for (let period of slotArray) {
        if (!isSlotAvailable(timetable, day, period)) return false;
        if (isFacultyBusy(faculty, day, period)) return false;
    }
    return true;
}

function findBestLabDay(timetable, faculty, maxDays, sectionId) {
    for (let day = 0; day < maxDays; day++) {
        if (canPlaceLabAtSlot(timetable, faculty, day, LAB_SLOTS.MORNING, sectionId)) {
            return { day, slots: LAB_SLOTS.MORNING };
        }
        if (canPlaceLabAtSlot(timetable, faculty, day, LAB_SLOTS.AFTERNOON, sectionId)) {
            return { day, slots: LAB_SLOTS.AFTERNOON };
        }
    }
    return null;
}

function assignRoom() {
    return Math.floor(Math.random() * globalState.totalRooms) + 1;
}

function countSubjectInDay(timetable, day, subjectName) {
    let count = 0;
    for (let period of TEACHING_PERIODS) {
        const cell = timetable[day][period];
        if (cell && cell.type === 'theory' && cell.subject === subjectName) {
            count++;
        }
    }
    return count;
}

function countAvailableSlotsInDay(timetable, day, faculty) {
    let count = 0;
    for (let period of TEACHING_PERIODS) {
        if (isSlotAvailable(timetable, day, period) && !isFacultyBusy(faculty, day, period)) {
            count++;
        }
    }
    return count;
}

/* ============================================
   LAB SCHEDULING - ONE PER DAY PER SECTION
   ============================================ */

function scheduleLabsStrictly(sectionId, labs, timetable) {
    for (let lab of labs) {
        let labPlaced = false;
        
        for (let attempt = 0; attempt < 100; attempt++) {
            const labSlot = findBestLabDay(timetable, lab.faculty, globalState.totalDays, sectionId);
            if (!labSlot) break;

            const room = assignRoom();
            const { day, slots } = labSlot;

            for (let period of slots) {
                timetable[day][period] = {
                    type: 'lab',
                    subject: lab.name,
                    faculty: lab.faculty,
                    room: room,
                    sectionId: sectionId
                };
                markFacultyBusy(lab.faculty, day, period, sectionId, lab.name, 'lab', room);
            }
            
            markLabOnDay(sectionId, day); // IMPORTANT: Mark that this day has a lab
            labPlaced = true;
            break;
        }

        if (!labPlaced) {
            console.warn(`Could not schedule lab: ${lab.name}`);
        }
    }
}

/* ============================================
   SMART SUBJECT SCHEDULING
   ============================================ */

function scheduleSubjectsSmart(sectionId, subjects, timetable) {
    // Sort by hours (descending)
    const sorted = [...subjects].sort((a, b) => b.periodsPerWeek - a.periodsPerWeek);

    for (let subject of sorted) {
        let remainingHours = subject.periodsPerWeek;
        const targetDays = Math.min(globalState.totalDays, remainingHours);
        
        // Create day distribution plan
        const daysToUse = [];
        for (let i = 0; i < targetDays && daysToUse.length < globalState.totalDays; i++) {
            let bestDay = -1;
            let minHours = Infinity;
            
            for (let d = 0; d < globalState.totalDays; d++) {
                if (daysToUse.includes(d)) continue;
                const hoursOnDay = countSubjectInDay(timetable, d, subject.name);
                if (hoursOnDay < minHours) {
                    minHours = hoursOnDay;
                    bestDay = d;
                }
            }
            
            if (bestDay !== -1) {
                daysToUse.push(bestDay);
            }
        }

        // Distribute hours across selected days
        for (let day of daysToUse) {
            if (remainingHours <= 0) break;

            // Try to place 1-2 hours on this day
            const hoursThisDay = Math.min(2, remainingHours);
            let placedThisDay = 0;

            for (let period of TEACHING_PERIODS) {
                if (placedThisDay >= hoursThisDay) break;
                if (remainingHours <= 0) break;

                if (isSlotAvailable(timetable, day, period) && 
                    !isFacultyBusy(subject.faculty, day, period)) {

                    const room = assignRoom();
                    timetable[day][period] = {
                        type: 'theory',
                        subject: subject.name,
                        faculty: subject.faculty,
                        room: room,
                        sectionId: sectionId
                    };

                    markFacultyBusy(subject.faculty, day, period, sectionId, subject.name, 'theory', room);
                    remainingHours--;
                    placedThisDay++;
                }
            }
        }

        // Handle any remaining hours
        if (remainingHours > 0) {
            outerLoop: for (let attempt = 0; attempt < 100 && remainingHours > 0; attempt++) {
                for (let day = 0; day < globalState.totalDays; day++) {
                    for (let period of TEACHING_PERIODS) {
                        if (remainingHours <= 0) break outerLoop;

                        if (isSlotAvailable(timetable, day, period) && 
                            !isFacultyBusy(subject.faculty, day, period)) {

                            const room = assignRoom();
                            timetable[day][period] = {
                                type: 'theory',
                                subject: subject.name,
                                faculty: subject.faculty,
                                room: room,
                                sectionId: sectionId
                            };

                            markFacultyBusy(subject.faculty, day, period, sectionId, subject.name, 'theory', room);
                            remainingHours--;
                        }
                    }
                }
            }
        }
    }
}

/* ============================================
   INPUT GENERATION
   ============================================ */

function generateSubjectGrids() {
    const sections = parseInt(document.getElementById("sections").value);
    const subjects = parseInt(document.getElementById("subjects").value);
    const container = document.getElementById("subjectContainer");

    container.innerHTML = "";

    for (let s = 1; s <= sections; s++) {
        const block = document.createElement("div");
        block.className = "section-block";

        let html = `<h3>📚 Section ${s}</h3>
            <table class="inputTable">
                <tr>
                    <th>Subject Name</th>
                    <th>Faculty Name</th>
                    <th>Hours/Week</th>
                </tr>`;

        for (let i = 1; i <= subjects; i++) {
            html += `<tr>
                <td><input type="text" id="sec${s}sub${i}" placeholder="Subject" /></td>
                <td><input type="text" id="sec${s}fac${i}" placeholder="Faculty" /></td>
                <td><input type="number" id="sec${s}per${i}" value="2" min="1" max="10" /></td>
            </tr>`;
        }

        html += `</table>`;
        block.innerHTML = html;
        container.appendChild(block);
    }
}

function generateLabGrids() {
    const sections = parseInt(document.getElementById("sections").value);
    const labs = parseInt(document.getElementById("labs").value);
    const container = document.getElementById("labContainer");

    container.innerHTML = "";

    for (let s = 1; s <= sections; s++) {
        const block = document.createElement("div");
        block.className = "section-block";

        let html = `<h3>🧪 Section ${s} - Labs</h3>
            <table class="inputTable">
                <tr>
                    <th>Lab Name</th>
                    <th>Faculty Name</th>
                </tr>`;

        for (let l = 1; l <= labs; l++) {
            html += `<tr>
                <td><input type="text" id="sec${s}lab${l}name" placeholder="Lab" /></td>
                <td><input type="text" id="sec${s}lab${l}fac" placeholder="Faculty" /></td>
            </tr>`;
        }

        html += `</table>`;
        block.innerHTML = html;
        container.appendChild(block);
    }
}

/* ============================================
   MAIN GENERATION FUNCTION
   ============================================ */

function generateTimetable() {
    console.clear();
    console.log("=".repeat(70));
    console.log("COLLEGE TIMETABLE v6.0 - SMART DISTRIBUTION + INTERACTIVE DASHBOARD");
    console.log("=".repeat(70));

    globalState.sections = [];
    globalState.facultyData = {};
    globalState.sectionLabDays = {};

    const totalSections = parseInt(document.getElementById("sections").value);
    const totalSubjects = parseInt(document.getElementById("subjects").value);
    const totalLabs = parseInt(document.getElementById("labs").value);
    globalState.totalDays = parseInt(document.getElementById("workingDays").value);
    globalState.totalRooms = parseInt(document.getElementById("rooms").value);

    console.log(`Config: ${totalSections} sections, ${totalSubjects} subjects, ${totalLabs} labs\n`);

    for (let s = 1; s <= totalSections; s++) {
        console.log(`${"=".repeat(70)}\nSECTION ${s}\n${"=".repeat(70)}`);

        const timetable = [];
        for (let d = 0; d < globalState.totalDays; d++) {
            timetable[d] = new Array(8).fill(null);
            timetable[d][3] = { type: 'lunch' };
        }

        // Collect and schedule labs
        const labs = [];
        for (let l = 1; l <= totalLabs; l++) {
            const labName = document.getElementById(`sec${s}lab${l}name`)?.value?.trim();
            const labFac = document.getElementById(`sec${s}lab${l}fac`)?.value?.trim();
            if (labName && labFac) labs.push({ name: labName, faculty: labFac });
        }

        if (labs.length > 0) {
            console.log(`Scheduling ${labs.length} labs (ONE per day per section)...`);
            scheduleLabsStrictly(s, labs, timetable);
        }

        // Collect and schedule subjects
        const subjects = [];
        let totalExpectedHours = 0;
        for (let i = 1; i <= totalSubjects; i++) {
            const subName = document.getElementById(`sec${s}sub${i}`)?.value?.trim();
            const subFac = document.getElementById(`sec${s}fac${i}`)?.value?.trim();
            const hours = parseInt(document.getElementById(`sec${s}per${i}`)?.value) || 0;

            if (subName && subFac && hours > 0) {
                subjects.push({ name: subName, faculty: subFac, periodsPerWeek: hours });
                totalExpectedHours += hours;
            }
        }

        if (subjects.length > 0) {
            console.log(`Scheduling ${subjects.length} subjects (${totalExpectedHours} hours) - SMART DISTRIBUTION...`);
            scheduleSubjectsSmart(s, subjects, timetable);
        }

        // Count hours
        let scheduledTheoryHours = 0;
        let scheduledLabHours = 0;

        for (let d = 0; d < globalState.totalDays; d++) {
            for (let p of TEACHING_PERIODS) {
                if (timetable[d][p]) {
                    if (timetable[d][p].type === 'theory') scheduledTheoryHours++;
                    else if (timetable[d][p].type === 'lab') scheduledLabHours++;
                }
            }
        }

        globalState.sections.push({
            id: s,
            name: `Section ${s}`,
            timetable: timetable,
            subjects: subjects,
            labs: labs,
            totalHoursExpected: totalExpectedHours,
            totalHoursScheduled: scheduledTheoryHours,
            totalLabHours: scheduledLabHours
        });

        console.log(`✓ Section ${s}: Expected ${totalExpectedHours}h → Scheduled ${scheduledTheoryHours}h + ${scheduledLabHours}h labs`);
    }

    console.log(`\n✓ Faculty members: ${Object.keys(globalState.facultyData).length}\n`);

    displaySectionTimetables();
    displayFacultyTimetables();
    displayStatisticsDashboard();

    document.getElementById("outputSection").style.display = "block";
    document.getElementById("inputForms").style.display = "none";

    console.log(`${"=".repeat(70)}\n✓ COMPLETE\n${"=".repeat(70)}`);
}

/* ============================================
   DISPLAY FUNCTIONS
   ============================================ */

function displaySectionTimetables() {
    const container = document.getElementById("sectionTimetables");
    container.innerHTML = "";

    for (let section of globalState.sections) {
        const card = document.createElement("div");
        card.className = "timetable-card";

        const percentage = section.totalHoursExpected > 0 
            ? Math.round((section.totalHoursScheduled / section.totalHoursExpected) * 100) 
            : 0;

        let html = `<h3>📚 ${section.name}</h3>
            <div class="hours-summary" style="background: linear-gradient(90deg, #1a3a2a 0%, #0f2818 100%); padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 4px solid #10b981;">
                <strong style="color: #10b981; font-size: 1.1em;">Hours Distribution:</strong><br/>
                <span style="color: #e5e7eb;">Expected: <strong style="color: #fbbf24;">${section.totalHoursExpected}h</strong> | 
                Scheduled: <strong style="color: #10b981;">${section.totalHoursScheduled}h</strong> | 
                Labs: <strong style="color: #60a5fa;">${section.totalLabHours}h</strong> | 
                Total: <strong style="color: #c084fc;">${section.totalHoursScheduled + section.totalLabHours}h</strong></span><br/>
                <div style="margin-top: 8px; background: #0f2818; border-radius: 4px; height: 6px; overflow: hidden;">
                    <div style="background: linear-gradient(90deg, #10b981 0%, #f59e0b 100%); height: 100%; width: ${percentage}%; border-radius: 4px;"></div>
                </div>
                <span style="color: #9ca3af; font-size: 0.9em; margin-top: 4px; display: block;">Completion: ${percentage}%</span>
            </div>
            <div style="margin-bottom: 15px;">
                <button class="btn btn-info" onclick="exportSectionPDF(${section.id})">📄 Download PDF</button>
                <button class="btn btn-info" onclick="exportSectionExcel(${section.id})">📊 Download Excel</button>
            </div>
            <table class="timetable">
                <tr><th>Period</th>`;

        for (let d = 0; d < globalState.totalDays; d++) {
            html += `<th>${DAYS[d]}</th>`;
        }
        html += `</tr>`;

        for (let p = 0; p < 8; p++) {
            html += `<tr><th>${PERIODS[p]}</th>`;
            for (let d = 0; d < globalState.totalDays; d++) {
                const cell = section.timetable[d][p];
                if (cell) {
                    if (cell.type === 'lunch') {
                        html += `<td class="lunch">LUNCH</td>`;
                    } else {
                        html += `<td><strong>${cell.subject}</strong><br/><small>${cell.faculty}</small><br/><small>R${cell.room}</small></td>`;
                    }
                } else {
                    html += `<td style="background: #1a3a2a;">—</td>`;
                }
            }
            html += `</tr>`;
        }

        html += `</table>`;
        card.innerHTML = html;
        container.appendChild(card);
    }
}

function displayFacultyTimetables() {
    const container = document.getElementById("facultyTimetables");
    container.innerHTML = "";

    for (let facultyName in globalState.facultyData) {
        const faculty = globalState.facultyData[facultyName];
        const card = document.createElement("div");
        card.className = "timetable-card";

        const facultyTimetable = [];
        for (let d = 0; d < globalState.totalDays; d++) {
            facultyTimetable[d] = new Array(8).fill(null);
            facultyTimetable[d][3] = { type: 'lunch' };
        }

        for (let assignment of faculty.assignments) {
            facultyTimetable[assignment.day][assignment.period] = {
                type: assignment.type,
                subject: assignment.subject,
                section: assignment.section,
                room: assignment.room
            };
        }

        const stats = calculateFacultyStats(faculty);

        let html = `<h3>👨‍🏫 ${facultyName}</h3>
            
            <div style="margin-bottom: 15px;">
                <button class="btn btn-info" onclick="exportFacultyPDF('${facultyName.replace(/'/g, "\\'")}')">📄 Download PDF</button>
                <button class="btn btn-info" onclick="exportFacultyExcel('${facultyName.replace(/'/g, "\\'")}')">📊 Download Excel</button>
            </div>

            <div class="faculty-details">
                <h4>📋 Sections Handled</h4>
                <ul>`;

        for (let sectionId of faculty.sectionsHandled) {
            const subjects = faculty.assignments
                .filter(a => a.section === sectionId && a.type === 'theory')
                .map(a => a.subject)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ");
            html += `<li><strong>Section ${sectionId}:</strong> ${subjects || 'Labs Only'}</li>`;
        }

        html += `</ul></div>
                <div class="faculty-summary">
                    <h4>📊 Summary</h4>
                    <p>Total Classes: <strong>${stats.totalClasses}</strong></p>
                    <p>Theory: <strong>${stats.theoryClasses}</strong> | Labs: <strong>${stats.labSessions}</strong></p>
                </div>

                <div class="faculty-stats">
                    <h4>📈 Statistics</h4>
                    <p>Workload: <strong>${stats.workloadPercentage}%</strong></p>
                    <p>Busiest Day: <strong>${stats.busiestDay}</strong> (${stats.maxDailyLoad} classes)</p>
                    <p>Free Periods: <strong>${stats.freePeriods}</strong></p>
                </div>

                <table class="timetable" style="margin-top: 20px;">
                    <tr><th>Period</th>`;

        for (let d = 0; d < globalState.totalDays; d++) {
            html += `<th>${DAYS[d]}</th>`;
        }
        html += `</tr>`;

        for (let p = 0; p < 8; p++) {
            html += `<tr><th>${PERIODS[p]}</th>`;
            for (let d = 0; d < globalState.totalDays; d++) {
                const cell = facultyTimetable[d][p];
                if (cell) {
                    if (cell.type === 'lunch') {
                        html += `<td class="lunch">LUNCH</td>`;
                    } else {
                        html += `<td><strong>${cell.subject}</strong><br/><small>Sec ${cell.section}</small><br/><small>R${cell.room}</small></td>`;
                    }
                } else {
                    html += `<td class="free">Free</td>`;
                }
            }
            html += `</tr>`;
        }

        html += `</table>`;
        card.innerHTML = html;
        container.appendChild(card);
    }
}

function calculateFacultyStats(faculty) {
    const maxPeriods = (globalState.totalDays * TEACHING_PERIODS.length);
    const workloadPercentage = Math.round((faculty.totalPeriods / maxPeriods) * 100);

    let busiestDay = "N/A", maxDailyLoad = 0;
    for (let day = 0; day < globalState.totalDays; day++) {
        if ((faculty.dailyLoad[day] || 0) > maxDailyLoad) {
            maxDailyLoad = faculty.dailyLoad[day];
            busiestDay = DAYS[day];
        }
    }

    const freePeriods = maxPeriods - faculty.totalPeriods;

    return {
        totalClasses: faculty.totalPeriods,
        theoryClasses: faculty.theoryPeriods,
        labSessions: faculty.labPeriods,
        workloadPercentage: workloadPercentage,
        busiestDay: busiestDay,
        maxDailyLoad: maxDailyLoad,
        freePeriods: freePeriods,
        maxPeriods: maxPeriods
    };
}

/* ============================================
   INTERACTIVE STATISTICS DASHBOARD
   ============================================ */

function displayStatisticsDashboard() {
    const container = document.getElementById("statisticsPanel");
    if (!container) return;

    let html = `
        <div class="stats-grid">
            <!-- Section Overview Cards -->
            <div class="stats-section">
                <h3>📚 Section Overview</h3>
                <div class="card-grid">
    `;

    // Section cards
    for (let section of globalState.sections) {
        const percent = section.totalHoursExpected > 0 
            ? Math.round((section.totalHoursScheduled / section.totalHoursExpected) * 100)
            : 0;
        const statusColor = percent === 100 ? '#10b981' : percent >= 80 ? '#f59e0b' : '#ef4444';

        html += `
            <div class="info-card" style="border-left: 4px solid ${statusColor};">
                <h4 style="color: ${statusColor};">📚 ${section.name}</h4>
                <div class="card-stat">
                    <span>Hours Scheduled</span>
                    <strong>${section.totalHoursScheduled}/${section.totalHoursExpected}h</strong>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percent}%; background: ${statusColor};"></div>
                </div>
                <div class="card-stat" style="margin-top: 10px; font-size: 0.9em;">
                    <span>Completion: ${percent}%</span>
                </div>
                <div class="card-grid-mini">
                    <div><span>Subjects</span><strong>${section.subjects.length}</strong></div>
                    <div><span>Labs</span><strong>${section.labs.length}</strong></div>
                </div>
            </div>
        `;
    }

    html += `
                </div>
            </div>

            <!-- Faculty Workload Cards -->
            <div class="stats-section">
                <h3>👨‍🏫 Faculty Workload</h3>
                <div class="card-grid">
    `;

    // Faculty workload cards
    const maxPeriods = globalState.totalDays * TEACHING_PERIODS.length;
    for (let facultyName in globalState.facultyData) {
        const faculty = globalState.facultyData[facultyName];
        const workload = Math.round((faculty.totalPeriods / maxPeriods) * 100);
        const workloadColor = workload >= 80 ? '#ef4444' : workload >= 50 ? '#f59e0b' : '#10b981';

        html += `
            <div class="info-card" style="border-left: 4px solid ${workloadColor};">
                <h4 style="color: ${workloadColor};">👨‍🏫 ${facultyName}</h4>
                <div class="card-stat">
                    <span>Workload</span>
                    <strong>${workload}%</strong>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${workload}%; background: ${workloadColor};"></div>
                </div>
                <div class="card-grid-mini">
                    <div><span>Classes</span><strong>${faculty.totalPeriods}</strong></div>
                    <div><span>Sections</span><strong>${faculty.sectionsHandled.size}</strong></div>
                </div>
                <div class="card-stat" style="margin-top: 10px; font-size: 0.9em; color: #9ca3af;">
                    <span>Theory: ${faculty.theoryPeriods} | Labs: ${faculty.labPeriods}</span>
                </div>
            </div>
        `;
    }

    html += `
                </div>
            </div>

            <!-- Detailed Analytics Table -->
            <div class="stats-section" style="grid-column: 1/-1;">
                <h3>📊 Detailed Faculty Analytics</h3>
                <div class="table-container">
    `;

    html += `
                    <table class="analytics-table">
                        <thead>
                            <tr>
                                <th>Faculty Name</th>
                                <th>Workload %</th>
                                <th>Total Classes</th>
                                <th>Theory</th>
                                <th>Labs</th>
                                <th>Sections</th>
                                <th>Busiest Day</th>
                                <th>Free Periods</th>
                            </tr>
                        </thead>
                        <tbody>
    `;

    for (let facultyName in globalState.facultyData) {
        const faculty = globalState.facultyData[facultyName];
        const stats = calculateFacultyStats(faculty);
        const workloadColor = stats.workloadPercentage >= 80 ? '#ef4444' : 
                             stats.workloadPercentage >= 50 ? '#f59e0b' : '#10b981';

        html += `
                            <tr>
                                <td><strong>${facultyName}</strong></td>
                                <td><span style="color: ${workloadColor}; font-weight: bold;">${stats.workloadPercentage}%</span></td>
                                <td>${stats.totalClasses}</td>
                                <td>${stats.theoryClasses}</td>
                                <td>${stats.labSessions}</td>
                                <td>${stats.totalClasses > 0 ? faculty.sectionsHandled.size : 0}</td>
                                <td>${stats.busiestDay}</td>
                                <td>${stats.freePeriods}</td>
                            </tr>
        `;
    }

    html += `
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Daily Workload Breakdown -->
            <div class="stats-section" style="grid-column: 1/-1;">
                <h3>📅 Daily Workload Breakdown</h3>
                <div class="daily-breakdown">
    `;

    for (let day = 0; day < globalState.totalDays; day++) {
        let totalClassesThisDay = 0;
        for (let facultyName in globalState.facultyData) {
            const faculty = globalState.facultyData[facultyName];
            totalClassesThisDay += (faculty.dailyLoad[day] || 0);
        }

        html += `
                    <div class="day-card">
                        <h5>${DAYS[day]}</h5>
                        <div class="day-stat">
                            <span>Total Classes: <strong>${totalClassesThisDay}</strong></span>
                        </div>
        `;

        for (let facultyName in globalState.facultyData) {
            const faculty = globalState.facultyData[facultyName];
            const dailyLoad = faculty.dailyLoad[day] || 0;
            if (dailyLoad > 0) {
                html += `<div class="faculty-day-load">${facultyName}: <strong>${dailyLoad}</strong></div>`;
            }
        }

        html += `</div>`;
    }

    html += `
                </div>
            </div>

            <!-- Free Hours Analysis -->
            <div class="stats-section" style="grid-column: 1/-1;">
                <h3>⏳ Free Hours Analysis</h3>
                <div class="free-hours-analysis">
    `;

    for (let facultyName in globalState.facultyData) {
        const faculty = globalState.facultyData[facultyName];
        const stats = calculateFacultyStats(faculty);
        const freePct = Math.round((stats.freePeriods / stats.maxPeriods) * 100);

        html += `
                    <div class="free-hours-card">
                        <h5>${facultyName}</h5>
                        <div class="free-hours-stat">
                            <span>Free Periods: <strong>${stats.freePeriods}/${stats.maxPeriods}</strong></span>
                            <span style="font-size: 0.9em; color: #9ca3af;">(${freePct}%)</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${freePct}%; background: #60a5fa;"></div>
                        </div>
                    </div>
        `;
    }

    html += `
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/* ============================================
   EXPORT FUNCTIONS
   ============================================ */

function exportSectionPDF(sectionId) {
    const section = globalState.sections.find(s => s.id === sectionId);
    if (!section) return;

    let content = `\n\nSECTION ${section.id} TIMETABLE\n`;
    content += `Expected: ${section.totalHoursExpected}h | Scheduled: ${section.totalHoursScheduled}h | Labs: ${section.totalLabHours}h\n\n`;
    content += "Time".padEnd(15);
    for (let d = 0; d < globalState.totalDays; d++) {
        content += DAYS[d].padEnd(20);
    }
    content += "\n" + "=".repeat(150) + "\n";

    for (let p = 0; p < 8; p++) {
        content += PERIODS[p].padEnd(15);
        for (let d = 0; d < globalState.totalDays; d++) {
            const cell = section.timetable[d][p];
            const cellText = cell ? (cell.type === 'lunch' ? 'LUNCH' : `${cell.subject}(${cell.faculty})`) : '—';
            content += cellText.padEnd(20);
        }
        content += "\n";
    }

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', `Section_${sectionId}_Timetable.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function exportSectionExcel(sectionId) {
    const section = globalState.sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = [
        [`SECTION ${section.id} TIMETABLE`],
        [`Expected: ${section.totalHoursExpected}h | Scheduled: ${section.totalHoursScheduled}h | Labs: ${section.totalLabHours}h`],
        [],
        ['Time', ...DAYS.slice(0, globalState.totalDays)]
    ];

    for (let p = 0; p < 8; p++) {
        const row = [PERIODS[p]];
        for (let d = 0; d < globalState.totalDays; d++) {
            const cell = section.timetable[d][p];
            row.push(cell ? (cell.type === 'lunch' ? 'LUNCH' : `${cell.subject}\n${cell.faculty}\nRoom ${cell.room}`) : '');
        }
        data.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Section_${section.id}`);
    XLSX.writeFile(wb, `Section_${section.id}_Timetable.xlsx`);
}

function exportFacultyPDF(facultyName) {
    const faculty = globalState.facultyData[facultyName];
    if (!faculty) return;

    const facultyTimetable = [];
    for (let d = 0; d < globalState.totalDays; d++) {
        facultyTimetable[d] = new Array(8).fill(null);
        facultyTimetable[d][3] = { type: 'lunch' };
    }

    for (let assignment of faculty.assignments) {
        facultyTimetable[assignment.day][assignment.period] = {
            type: assignment.type,
            subject: assignment.subject,
            section: assignment.section
        };
    }

    let content = `\n\n${facultyName} - TIMETABLE\n`;
    content += "Time".padEnd(15);
    for (let d = 0; d < globalState.totalDays; d++) {
        content += DAYS[d].padEnd(20);
    }
    content += "\n" + "=".repeat(150) + "\n";

    for (let p = 0; p < 8; p++) {
        content += PERIODS[p].padEnd(15);
        for (let d = 0; d < globalState.totalDays; d++) {
            const cell = facultyTimetable[d][p];
            const cellText = cell ? (cell.type === 'lunch' ? 'LUNCH' : `${cell.subject}(Sec ${cell.section})`) : 'Free';
            content += cellText.padEnd(20);
        }
        content += "\n";
    }

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', `${facultyName}_Timetable.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function exportFacultyExcel(facultyName) {
    const faculty = globalState.facultyData[facultyName];
    if (!faculty) return;

    const facultyTimetable = [];
    for (let d = 0; d < globalState.totalDays; d++) {
        facultyTimetable[d] = new Array(8).fill(null);
        facultyTimetable[d][3] = { type: 'lunch' };
    }

    for (let assignment of faculty.assignments) {
        facultyTimetable[assignment.day][assignment.period] = {
            type: assignment.type,
            subject: assignment.subject,
            section: assignment.section
        };
    }

    const data = [
        [`${facultyName} - TIMETABLE`],
        [],
        ['Time', ...DAYS.slice(0, globalState.totalDays)]
    ];

    for (let p = 0; p < 8; p++) {
        const row = [PERIODS[p]];
        for (let d = 0; d < globalState.totalDays; d++) {
            const cell = facultyTimetable[d][p];
            row.push(cell ? (cell.type === 'lunch' ? 'LUNCH' : `${cell.subject}\nSection ${cell.section}`) : 'Free');
        }
        data.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, facultyName.substring(0, 20));
    XLSX.writeFile(wb, `${facultyName}_Timetable.xlsx`);
}

/* ============================================
   UTILITY FUNCTIONS
   ============================================ */

function clearAll() {
    if (confirm("Clear all inputs?")) {
        document.getElementById("subjectContainer").innerHTML = "";
        document.getElementById("labContainer").innerHTML = "";
        document.getElementById("outputSection").style.display = "none";
        document.getElementById("inputForms").style.display = "block";
    }
}

function switchTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));

    if (tabName === "sections") document.getElementById("sectionTab").style.display = "block";
    else if (tabName === "faculty") document.getElementById("facultyTab").style.display = "block";
    else if (tabName === "statistics") document.getElementById("statisticsTab").style.display = "block";

    event.target.classList.add("active");
}

document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("sections").value = "3";
    document.getElementById("subjects").value = "6";
    document.getElementById("labs").value = "1";
    document.getElementById("rooms").value = "10";
    document.getElementById("workingDays").value = "6";
});
