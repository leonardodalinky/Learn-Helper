import {
  ContentType,
  CourseContent,
  CourseInfo,
  Homework,
  SemesterInfo,
  SemesterType,
} from 'thu-learn-lib/lib/types';
import { Map } from 'immutable';
import orderBy from 'lodash/orderBy';

import {
  ContentInfo,
  DiscussionInfo,
  FileInfo,
  HomeworkInfo,
  NotificationInfo,
  QuestionInfo,
} from '../../types/data';
import { DataAction } from '../actions/data';
import { DataActionType } from '../actions/actionTypes';

interface IContentIgnore {
  [courseId: string]: {
    [type: string]: boolean;
  };
}

interface IDataState {
  semesters: string[]; // all available semesters return by Web Learning
  semester: SemesterInfo; // current semester of Learn Helper
  fetchedSemester: SemesterInfo; // current semester of Web Learning
  insistSemester: boolean;
  courseMap: Map<string, CourseInfo>;
  notificationMap: Map<string, NotificationInfo>;
  fileMap: Map<string, FileInfo>;
  homeworkMap: Map<string, HomeworkInfo>;
  discussionMap: Map<string, DiscussionInfo>;
  questionMap: Map<string, QuestionInfo>;
  lastUpdateTime: Date;
  updateFinished: boolean;
  contentIgnore: IContentIgnore;
}

export type DataState = IDataState;

const semesterPlaceholder: SemesterInfo = {
  id: '',
  startDate: new Date(),
  endDate: new Date(),
  startYear: 0,
  endYear: 0,
  type: SemesterType.UNKNOWN,
};

const initialState: IDataState = {
  semesters: [],
  semester: semesterPlaceholder,
  fetchedSemester: semesterPlaceholder,
  insistSemester: false,
  courseMap: Map<string, CourseInfo>(),
  notificationMap: Map<string, NotificationInfo>(),
  fileMap: Map<string, FileInfo>(),
  homeworkMap: Map<string, HomeworkInfo>(),
  discussionMap: Map<string, DiscussionInfo>(),
  questionMap: Map<string, QuestionInfo>(),
  lastUpdateTime: new Date(0),
  updateFinished: false,
  contentIgnore: {},
};

function update<T extends ContentInfo>(
  oldMap: Map<string, T>,
  contentType: ContentType,
  fetched: CourseContent,
  courseMap: Map<string, CourseInfo>,
  contentIgnore: IContentIgnore,
): Map<string, T> {
  let result = Map<string, ContentInfo>();

  const dateKey = {
    [ContentType.NOTIFICATION]: 'publishTime',
    [ContentType.FILE]: 'uploadTime',
    [ContentType.HOMEWORK]: 'deadline',
    [ContentType.DISCUSSION]: 'publishTime',
    [ContentType.QUESTION]: 'publishTime',
  };

  // we always use the fetched data
  for (const [courseId, content] of Object.entries(fetched)) {
    for (const c of content) {
      // compare the time of two contents (including undefined)
      // if they differ, mark the content as unread
      const oldContent = oldMap.get(c.id) as ContentInfo;
      const newDate = c[dateKey[contentType]];
      let updated = true;
      if (oldContent !== undefined) {
        if (newDate.getTime() === oldContent[dateKey[contentType]].getTime()) {
          // the date is not modified
          updated = false;
          if (contentType === ContentType.HOMEWORK) {
            const oldGradeTime = (oldContent as Homework).gradeTime;
            const newGradeTime = (c as Homework).gradeTime;
            if (newGradeTime && !oldGradeTime) {
              // newly-graded homework
              updated = true;
            } else if (
              newGradeTime &&
              oldGradeTime &&
              // re-graded homework
              newGradeTime.getTime() !== oldGradeTime.getTime()
            ) {
              updated = true;
            }
          }
        }
      }
      // copy other attributes either way
      const newContent: ContentInfo = {
        ...c,
        courseId,
        ignored: oldContent === undefined ? false : oldContent.ignored,
        type: contentType,
        courseName: courseMap.get(courseId).name,
        date: newDate,
        hasRead: oldContent === undefined ? false : !updated && oldContent.hasRead,
        starred: oldContent === undefined ? false : oldContent.starred,
      };
      result = result.set(c.id, newContent);
    }
  }

  // the upcast is necessary
  return result as Map<string, T>;
}

function toggle<T extends ContentInfo>(
  oldMap: Map<string, T>,
  id: string,
  key: string,
  status: boolean,
): Map<string, T> {
  return oldMap.update(id, (c: any) => ({
    ...c,
    [key]: status,
  }));
}

function markAllRead<T extends ContentInfo>(oldMap: Map<string, T>): Map<string, T> {
  let map = oldMap;
  for (const k of oldMap.keys()) {
    map = map.update(k, (c: any) => ({
      ...c,
      hasRead: true,
    }));
  }
  return map;
}

const IGNORE_UNSET_ALL = {
  [ContentType.NOTIFICATION]: false,
  [ContentType.FILE]: false,
  [ContentType.HOMEWORK]: false,
  [ContentType.QUESTION]: false,
  [ContentType.DISCUSSION]: false,
};

export default function data(state: IDataState = initialState, action: DataAction): IDataState {
  const stateKey = `${action.contentType}Map`;

  switch (action.type) {
    case DataActionType.UPDATE_SEMESTER_LIST:
      return {
        ...state,
        semesters: action.semesters,
      };

    case DataActionType.NEW_SEMESTER:
      // save the new semester for querying user
      return {
        ...state,
        fetchedSemester: action.semester,
      };

    case DataActionType.INSIST_SEMESTER:
      return {
        ...state,
        insistSemester: action.insist,
      };

    case DataActionType.UPDATE_SEMESTER:
      // switch to new semester, remove all content
      return {
        ...initialState,
        semesters: state.semesters,
        fetchedSemester: state.fetchedSemester,
        semester: action.semester,
      };

    case DataActionType.UPDATE_COURSES: {
      // update course list and ignoring list
      // any content that belongs to removed courses will be removed in following steps
      let courseMap = Map<string, CourseInfo>();
      const { contentIgnore } = state;
      for (const c of orderBy(action.courseList, ['id'])) {
        courseMap = courseMap.set(c.id, c);
        if (contentIgnore[c.id] === undefined) {
          contentIgnore[c.id] = {
            ...IGNORE_UNSET_ALL,
          };
        }
      }
      // remove courses that do not exist any more
      // otherwise the app will crash after dropping any course
      for (const k of [...Object.keys(contentIgnore)]) {
        if (!courseMap.has(k)) {
          delete contentIgnore[k];
        }
      }
      return {
        ...state,
        contentIgnore,
        courseMap,
      };
    }

    case DataActionType.UPDATE_CONTENT:
      return {
        ...state,
        [stateKey]: update(
          state[stateKey],
          action.contentType,
          action.content,
          state.courseMap,
          state.contentIgnore,
        ),
        lastUpdateTime: new Date(),
        updateFinished: false,
      };

    case DataActionType.UPDATE_FINISHED:
      return {
        ...state,
        updateFinished: true,
      };

    case DataActionType.TOGGLE_CONTENT_IGNORE:
      return {
        ...state,
        contentIgnore: {
          ...state.contentIgnore,
          [action.id]: {
            ...state.contentIgnore[action.id],
            [action.contentType]: action.state,
          },
        },
        updateFinished: false,
      };

    case DataActionType.RESET_CONTENT_IGNORE: {
      const contentIgnore = {};
      for (const c of [...state.courseMap.keys()].sort()) {
        contentIgnore[c] = {
          ...IGNORE_UNSET_ALL,
        };
      }
      return {
        ...state,
        contentIgnore,
        updateFinished: false,
      };
    }

    case DataActionType.MARK_ALL_READ:
      return {
        ...state,
        notificationMap: markAllRead(state.notificationMap),
        fileMap: markAllRead(state.fileMap),
        homeworkMap: markAllRead(state.homeworkMap),
        discussionMap: markAllRead(state.discussionMap),
        questionMap: markAllRead(state.questionMap),
      };

    case DataActionType.TOGGLE_READ_STATE:
      return {
        ...state,
        [stateKey]: toggle(state[stateKey], action.id, 'hasRead', action.state),
      };

    case DataActionType.TOGGLE_STAR_STATE:
      return {
        ...state,
        [stateKey]: toggle(state[stateKey], action.id, 'starred', action.state),
      };

    case DataActionType.TOGGLE_IGNORE_STATE:
      return {
        ...state,
        [stateKey]: toggle(state[stateKey], action.id, 'ignored', action.state),
      };

    case DataActionType.CLEAR_ALL_DATA:
      return initialState;

    case DataActionType.CLEAR_FETCHED_DATA:
      return {
        ...state,
        courseMap: Map<string, CourseInfo>(),
        notificationMap: Map<string, NotificationInfo>(),
        fileMap: Map<string, FileInfo>(),
        homeworkMap: Map<string, HomeworkInfo>(),
        discussionMap: Map<string, DiscussionInfo>(),
        questionMap: Map<string, QuestionInfo>(),
        lastUpdateTime: new Date(0),
      };

    default:
      return state;
  }
}
