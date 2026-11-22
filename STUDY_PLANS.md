# Study plan storage and imports

The degree course links to an existing progress course through courseId. Content tasks use the existing semesters → courses → categories → tasks entity, and its ID is also used by timer sessions. Completion uses done; estimates use estimatedHours (number or null). Actual time remains in timer.sessions.

Additional task fields: plannedDate, plannedStart, plannedEnd, weekOf (Monday for flexible weekly workload), deadline, planBlockId, planImportKey. Legacy degree-course tasks migrate only on a confirmed save. Independent plans remain available.

Fixed/recurring events live in degreeCourse.planEvents. Calendar occurrences are virtual and generated only for the displayed range. They are never copied into timer.calendarItems. Moving a recurring occurrence adds an excluded date and a replacement event. Editing the course plan changes the whole series.

New planned tasks and generated progress courses stay out of read-only shares on both frontend and backend. Existing ordinary tasks keep their previous sharing behavior. All new fields survive the existing workspace/backup serialization.

## Import v1

Old #study-plan-v1= links and four-column text remain supported:

    {"course":"EI04001","tasks":"每周三 13:15–16:15 | 课堂 | 上课 | 3\n跟随课程 | 作业 | 完成当周作业 | 2"}

Confirm the recurrence date range before saving. The legacy importer recognizes the dated Workshop replacement and Chinese milestone dates in the supplied K&C example. It does not infer unspecified holidays or project hours.

Unknown estimates may be blank, null, "待定", "未估算", "unknown" or "TBD". They remain null, rather than 0.

## Structured v2

Paste JSON into the existing import field or encode it into #study-plan-v2=. Keep source IDs stable when revising the same ChatGPT plan.

    {
      "course":"EI04001",
      "period":{"start":"2026-11-23","end":"2027-01-27"},
      "tasks":[
        {"id":"homework","title":"Weekly homework","group":"Übung","hours":2,
          "repeat":{"from":"2026-11-23","until":"2027-01-27","exceptDates":[]}},
        {"id":"project","title":"Project preparation","group":"Projekt","hours":null,
          "deadline":"2027-01-27"},
        {"id":"chapter3","title":"Study chapter 3","group":"Vorlesung","hours":2,
          "date":"2026-12-08","startTime":"10:00","endTime":"12:00"}
      ],
      "events":[
        {"id":"lecture","title":"Komputer & Creativität","type":"class",
          "date":"2026-11-23","startTime":"13:15","endTime":"16:15",
          "repeat":{"frequency":"weekly","weekdays":[3],"until":"2027-01-27",
            "exceptDates":["2026-12-09"]}},
        {"id":"workshop","title":"Required Workshop","type":"workshop",
          "date":"2026-12-09","startTime":"13:15","endTime":"16:30"},
        {"id":"pitch","title":"Kickoff / Pitch","type":"milestone","date":"2026-12-02"},
        {"id":"project-work","title":"Project working session","type":"study",
          "date":"2026-12-08","taskId":"project","startTime":"14:00","endTime":"16:00"}
      ]
    }

Event types: class, workshop, study, milestone, deadline. Monday = 1, Sunday = 7. Dates are local ISO dates, times HH:mm, ranges inclusive and limited to one year. Weekly task repeats reserve workload without assigning a day/time. For weekly tasks, repeat.exceptDates contains Monday week keys for whole skipped weeks. For events, repeat.exceptDates skips exact dates.

Do not create both a dated task and an event for the same session. Use the task date/time, or link an event via taskId while leaving its task undated.

Link encoding:

    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))
      .replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
    const link = location.origin + "/#study-plan-v2=" + encoded;

Import preview reports additions. Reimports retain matching task IDs, completion and manually moved task dates. Event recurrence exceptions also survive reimport.

## Checks

Run node check.mjs, node degree-plan.test.mjs, node cloud-core.test.mjs, node study-plan.test.mjs and python api-test.py.

For node study-plan-browser.test.mjs, configure PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE and optionally STUDY_TRACKER_TEST_URL (default http://127.0.0.1:8096).

The browser test uses an isolated guest context: K&C import, Workshop replacement, flexible work, progress, timer, existing calendar, reimport, persistence, dragging, day/week switching and mobile overflow. Screenshots go to the OS temporary directory.
