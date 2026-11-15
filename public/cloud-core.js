export function makeEmptyState() {
  return {
    ownerName: "",
    semesters: [],
    courseTemplates: [],
    timer: {
      sessions: [],
      active: null,
      calendarItems: []
    }
  };
}

export function makeSharedState(sourceState) {
  return {
    ownerName: sourceState?.ownerName || "",
    courseTemplates: [],
    semesters: (sourceState?.semesters || []).map(semester => ({
      id: semester.id,
      name: semester.name || "",
      kind: semester.kind === "module" ? "module" : "semester",
      collapsed: Boolean(semester.collapsed),
      infoCollapsed: true,
      note: "",
      attachments: [],
      courses: (semester.courses || []).map(course => ({
        id: course.id,
        name: course.name || "",
        label: course.label || "",
        collapsed: Boolean(course.collapsed),
        infoCollapsed: true,
        note: "",
        attachments: [],
        categories: (course.categories || []).map(category => ({
          id: category.id,
          name: category.name || "",
          collapsed: Boolean(category.collapsed),
          infoCollapsed: true,
          note: "",
          attachments: [],
          tasks: (category.tasks || []).map(task => ({
            id: task.id,
            title: task.title || "",
            detail: task.detail || "",
            name: task.name || "",
            done: Boolean(task.done),
            collapsed: true,
            note: "",
            attachments: []
          }))
        }))
      }))
    })),
    timer: {
      sessions: [],
      active: null,
      calendarItems: (sourceState?.timer?.calendarItems || [])
        .filter(item => !item.privateDegreeExam && !item.degreeExamId).map(item => ({
        id: item.id,
        type: item.type === "reminder" ? "reminder" : "exam",
        title: item.title || "",
        date: item.date || "",
        startTime: item.startTime || "",
        endTime: item.endTime || "",
        semesterId: item.semesterId || "",
        semesterName: item.semesterName || "",
        courseId: item.courseId || "",
        courseName: item.courseName || "",
        location: item.location || "",
        requirements: item.requirements || "",
        details: item.details || ""
      }))
    }
  };
}

export function shouldUploadLocal(localMeta, userId, cloudClientUpdatedAt) {
  return localMeta?.userId === userId
    && Number(localMeta.updatedAt || 0) > Number(cloudClientUpdatedAt || 0);
}

export function getAccountCacheKey(userId) {
  return `study-tracker-online-account-v1:${userId}`;
}

export function getAccountMetaKey(userId) {
  return `study-tracker-online-sync-meta-v1:${userId}`;
}
