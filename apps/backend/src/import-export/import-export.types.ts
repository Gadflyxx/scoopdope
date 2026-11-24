export interface CourseJsonLesson {
  id: string;
  title: string;
  content: string;
  videoUrl?: string;
  order: number;
  durationMinutes: number;
  parentLessonId?: string;
}

export interface CourseJsonQuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface CourseJsonQuizQuestion {
  id: string;
  prompt: string;
  type: 'single' | 'multiple' | 'boolean';
  options: CourseJsonQuizOption[];
  explanation?: string;
  points: number;
}

export interface CourseJsonQuiz {
  id: string;
  title: string;
  description?: string;
  lessonId?: string;
  passingScore: number;
  questions: CourseJsonQuizQuestion[];
}

export interface CourseJsonModule {
  id: string;
  title: string;
  order: number;
  lessons: CourseJsonLesson[];
}

export interface CourseJsonExport {
  version: '1.0';
  exportedAt: string;
  course: {
    title: string;
    description: string;
    level: string;
    durationHours: number;
    requiresKyc: boolean;
    modules: CourseJsonModule[];
    quizzes: CourseJsonQuiz[];
  };
}

export interface ImportFieldError {
  path: string;
  message: string;
}

export interface ImportValidationError {
  valid: false;
  errors: ImportFieldError[];
}

export interface ImportResult {
  valid: true;
  courseId: string;
  mode: 'create' | 'update';
  created: {
    modules: number;
    lessons: number;
    quizzes: number;
    questions: number;
  };
  updated: {
    modules: number;
    lessons: number;
    quizzes: number;
    questions: number;
  };
}

export interface CircularReferenceResult {
  hasCircularReference: boolean;
  cycles: string[][];
}