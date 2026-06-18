import assert from "node:assert/strict";
import {
  getAccountCacheKey,
  getAccountMetaKey,
  makeEmptyState,
  makeSharedState,
  shouldUploadLocal
} from "./public/cloud-core.js";

const privateState = {
  ownerName: "小林",
  futurePrivateField: "未来新增的私人字段",
  courseTemplates: [{ id: "template-1", name: "秘密模板" }],
  semesters: [{
    id: "semester-1",
    name: "第四学期",
    note: "私人学期备注",
    futurePrivateField: "私人学期未来字段",
    attachments: [{ name: "semester.pdf", data: "private-data" }],
    courses: [{
      id: "course-1",
      name: "数学",
      label: "公共课",
      note: "私人课程备注",
      futurePrivateField: "私人课程未来字段",
      attachments: [{ name: "course.pdf", data: "private-data" }],
      categories: [{
        id: "category-1",
        name: "复习",
        tasks: [{
          id: "task-1",
          title: "第一章",
          detail: "傅里叶",
          done: true,
          note: "私人任务备注",
          futurePrivateField: "私人任务未来字段",
          attachments: [{ name: "task.pdf", data: "private-data" }]
        }]
      }]
    }]
  }]
};

const shared = makeSharedState(privateState);

assert.notStrictEqual(shared, privateState);
assert.equal(privateState.semesters[0].note, "私人学期备注", "生成分享副本不能修改私人源数据");
assert.deepEqual(shared.courseTemplates, [], "分享副本不能包含课程模板");
assert.equal(shared.semesters[0].note, "", "分享副本不能包含学期备注");
assert.equal(shared.semesters[0].kind, "semester", "分享副本需要保留学习阶段类型");
assert.deepEqual(shared.semesters[0].attachments, [], "分享副本不能包含学期附件");
assert.equal(shared.semesters[0].courses[0].note, "", "分享副本不能包含课程备注");
assert.equal(shared.semesters[0].courses[0].label, "公共课", "分享副本需要保留课程标签");
assert.deepEqual(shared.semesters[0].courses[0].attachments, [], "分享副本不能包含课程附件");
assert.equal(shared.semesters[0].courses[0].categories[0].tasks[0].note, "", "分享副本不能包含任务备注");
assert.deepEqual(shared.semesters[0].courses[0].categories[0].tasks[0].attachments, [], "分享副本不能包含任务附件");
assert.equal(shared.semesters[0].courses[0].categories[0].tasks[0].done, true, "分享副本需要保留完成进度");
assert.equal("futurePrivateField" in shared, false, "未来新增的顶层字段默认不能进入分享副本");
assert.equal("futurePrivateField" in shared.semesters[0], false, "未来新增的学期字段默认不能进入分享副本");
assert.equal("futurePrivateField" in shared.semesters[0].courses[0], false, "未来新增的课程字段默认不能进入分享副本");
assert.equal("futurePrivateField" in shared.semesters[0].courses[0].categories[0].tasks[0], false, "未来新增的任务字段默认不能进入分享副本");

assert.equal(shouldUploadLocal({ userId: "a", updatedAt: 20 }, "a", 10), true);
assert.equal(shouldUploadLocal({ userId: "a", updatedAt: 10 }, "a", 20), false);
assert.equal(shouldUploadLocal({ userId: "a", updatedAt: 20 }, "b", 10), false, "不能把其他账号缓存上传到当前账号");
assert.notEqual(getAccountCacheKey("a"), getAccountCacheKey("b"), "不同账号必须使用不同本地缓存");
assert.notEqual(getAccountMetaKey("a"), getAccountMetaKey("b"), "不同账号必须使用不同同步时间记录");
assert.deepEqual(makeEmptyState(), { ownerName: "", semesters: [], courseTemplates: [], timer: { sessions: [], active: null } });

console.log("PASS cloud-core privacy, account isolation, and conflict tests");
