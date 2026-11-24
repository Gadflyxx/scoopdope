import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { LessonsService } from './lessons.service';
import { Lesson } from './lesson.entity';
import { CourseModule } from './course-module.entity';
import { Course } from './course.entity';
import { SearchService } from '../search/search.service';
import { TranscribeService } from './transcribe.service';
import { setupTestDatabase, teardownTestDatabase } from '../test/integration-test.setup';
import {
  AccessControlService,
  CourseVisibility,
} from '../access-control/access-control.service';

describe('LessonsService — Reorder (Integration)', () => {
  let service: LessonsService;
  let module: TestingModule;
  let dataSource: DataSource;
  let lessonRepo: any;
  let moduleRepo: any;
  let courseRepo: any;
  let accessControlService: AccessControlService;

  let testCourse: Course;
  let testModule: CourseModule;
  let testLessons: Lesson[] = [];

  beforeAll(async () => {
    dataSource = await setupTestDatabase();

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forFeature([Lesson, CourseModule, Course]),
        CacheModule.register(),
      ],
      providers: [
        LessonsService,
        {
          provide: SearchService,
          useValue: {
            indexLesson: jest.fn(),
            deleteFromIndex: jest.fn(),
          },
        },
        {
          provide: TranscribeService,
          useValue: {
            startTranscription: jest.fn(),
            getTranscriptionResult: jest.fn(),
          },
        },
        AccessControlService,
      ],
    })
      .overrideProvider('DataSource')
      .useValue(dataSource)
      .compile();

    service = module.get<LessonsService>(LessonsService);
    accessControlService = module.get<AccessControlService>(AccessControlService);
    lessonRepo = dataSource.getRepository(Lesson);
    moduleRepo = dataSource.getRepository(CourseModule);
    courseRepo = dataSource.getRepository(Course);
  });

  afterAll(async () => {
    await module.close();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Clear tables
    await lessonRepo.clear();
    await moduleRepo.clear();
    await courseRepo.clear();

    // Create test course
    testCourse = courseRepo.create({
      title: 'Test Course',
      description: 'Test Description',
      level: 'beginner',
      isPublished: true,
    });
    testCourse = await courseRepo.save(testCourse);

    // Create test module
    testModule = moduleRepo.create({
      courseId: testCourse.id,
      title: 'Test Module',
      order: 1,
    });
    testModule = await moduleRepo.save(testModule);

    // Create test lessons
    testLessons = [];
    for (let i = 0; i < 5; i++) {
      const lesson = lessonRepo.create({
        moduleId: testModule.id,
        title: `Lesson ${i}`,
        content: `Content for lesson ${i}`,
        order: i,
      });
      testLessons.push(await lessonRepo.save(lesson));
    }
  });

  describe('reorder', () => {
    it('should reorder lessons correctly', async () => {
      const newOrder = [testLessons[4].id, testLessons[2].id, testLessons[0].id];

      const result = await service.reorder(testModule.id, newOrder);

      expect(result).toHaveLength(5); // All lessons returned
      expect(result[0].id).toBe(testLessons[4].id);
      expect(result[0].order).toBe(0);
      expect(result[1].id).toBe(testLessons[2].id);
      expect(result[1].order).toBe(1);
      expect(result[2].id).toBe(testLessons[0].id);
      expect(result[2].order).toBe(2);
    });

    it('should persist reordered lessons to database', async () => {
      const newOrder = [
        testLessons[2].id,
        testLessons[0].id,
        testLessons[4].id,
      ];

      await service.reorder(testModule.id, newOrder);

      // Fetch lessons again from database to verify persistence
      const lessonsAfterReorder = await service.findByModule(testModule.id);

      expect(lessonsAfterReorder[0].id).toBe(testLessons[2].id);
      expect(lessonsAfterReorder[0].order).toBe(0);
      expect(lessonsAfterReorder[1].id).toBe(testLessons[0].id);
      expect(lessonsAfterReorder[1].order).toBe(1);
      expect(lessonsAfterReorder[2].id).toBe(testLessons[4].id);
      expect(lessonsAfterReorder[2].order).toBe(2);
    });

    it('should support partial reordering', async () => {
      const partialOrder = [testLessons[1].id, testLessons[3].id];

      const result = await service.reorder(testModule.id, partialOrder);

      // All lessons should be returned
      expect(result).toHaveLength(5);

      // Only specified lessons should have new order
      const lesson1 = result.find((l) => l.id === testLessons[1].id);
      const lesson3 = result.find((l) => l.id === testLessons[3].id);

      expect(lesson1?.order).toBe(0);
      expect(lesson3?.order).toBe(1);
    });

    it('should return all lessons in sorted order', async () => {
      const newOrder = [
        testLessons[4].id,
        testLessons[1].id,
        testLessons[3].id,
        testLessons[0].id,
        testLessons[2].id,
      ];

      const result = await service.reorder(testModule.id, newOrder);

      // Verify result is sorted by order field
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].order).toBeLessThanOrEqual(result[i + 1].order);
      }
    });

    it('should reject invalid lesson IDs', async () => {
      const invalidId = '00000000-0000-0000-0000-000000000000';

      await expect(
        service.reorder(testModule.id, [invalidId, testLessons[0].id]),
      ).rejects.toThrow();
    });

    it('should reject lesson ID from different module', async () => {
      // Create another module and lesson
      const anotherModule = moduleRepo.create({
        courseId: testCourse.id,
        title: 'Another Module',
        order: 2,
      });
      const savedModule = await moduleRepo.save(anotherModule);

      const otherLesson = lessonRepo.create({
        moduleId: savedModule.id,
        title: 'Other Lesson',
        content: 'Content',
        order: 0,
      });
      const savedOtherLesson = await lessonRepo.save(otherLesson);

      await expect(
        service.reorder(testModule.id, [
          testLessons[0].id,
          savedOtherLesson.id, // This lesson belongs to different module
        ]),
      ).rejects.toThrow();
    });

    it('should handle reorder of single lesson', async () => {
      const result = await service.reorder(testModule.id, [testLessons[3].id]);

      expect(result).toHaveLength(5);
      const reorderedLesson = result.find((l) => l.id === testLessons[3].id);
      expect(reorderedLesson?.order).toBe(0);
    });

    it('should handle complete reverse ordering', async () => {
      const reversedOrder = [...testLessons].reverse().map((l) => l.id);

      const result = await service.reorder(testModule.id, reversedOrder);

      expect(result[0].id).toBe(testLessons[4].id);
      expect(result[1].id).toBe(testLessons[3].id);
      expect(result[2].id).toBe(testLessons[2].id);
      expect(result[3].id).toBe(testLessons[1].id);
      expect(result[4].id).toBe(testLessons[0].id);
    });

    it('should maintain other lesson properties unchanged during reorder', async () => {
      const lessonBefore = testLessons[0];
      const newOrder = [testLessons[2].id, testLessons[0].id, testLessons[4].id];

      const result = await service.reorder(testModule.id, newOrder);

      const lessonAfter = result.find((l) => l.id === testLessons[0].id);

      expect(lessonAfter?.title).toBe(lessonBefore.title);
      expect(lessonAfter?.content).toBe(lessonBefore.content);
      expect(lessonAfter?.moduleId).toBe(lessonBefore.moduleId);
    });

    it('should work with lessons that have gaps in order values', async () => {
      // Create lessons with non-sequential order values
      await lessonRepo.clear();
      const lesson1 = lessonRepo.create({
        moduleId: testModule.id,
        title: 'Lesson 1',
        content: 'Content 1',
        order: 10,
      });
      const lesson2 = lessonRepo.create({
        moduleId: testModule.id,
        title: 'Lesson 2',
        content: 'Content 2',
        order: 20,
      });
      const lesson3 = lessonRepo.create({
        moduleId: testModule.id,
        title: 'Lesson 3',
        content: 'Content 3',
        order: 30,
      });

      await lessonRepo.save([lesson1, lesson2, lesson3]);

      const result = await service.reorder(testModule.id, [
        lesson3.id,
        lesson1.id,
        lesson2.id,
      ]);

      // Should reset order to sequential starting from 0
      expect(result[0].order).toBe(0);
      expect(result[1].order).toBe(1);
      expect(result[2].order).toBe(2);
    });
  });

  describe('findByModule', () => {
    it('should return lessons sorted by order field', async () => {
      // Reorder to test sorting
      await service.reorder(testModule.id, [
        testLessons[3].id,
        testLessons[0].id,
        testLessons[2].id,
        testLessons[1].id,
        testLessons[4].id,
      ]);

      const result = await service.findByModule(testModule.id);

      // Should be in order field order
      expect(result[0].id).toBe(testLessons[3].id);
      expect(result[1].id).toBe(testLessons[0].id);
      expect(result[2].id).toBe(testLessons[2].id);
      expect(result[3].id).toBe(testLessons[1].id);
      expect(result[4].id).toBe(testLessons[4].id);

      // Verify order values are sequential
      for (let i = 0; i < result.length; i++) {
        expect(result[i].order).toBe(i);
      }
    });
  });

  describe('course visibility enforcement', () => {
    const visibilityLevels: CourseVisibility[] = [
      'public',
      'unlisted',
      'enrolled_only',
      'private',
    ];

    const enrolledLearner = { id: 'learner-enrolled', isEnrolled: true };
    const nonEnrolledLearner = { id: 'learner-not-enrolled', isEnrolled: false };

    async function createCourseWithVisibility(
      visibility: CourseVisibility,
    ): Promise<{ course: Course; courseModule: CourseModule; lesson: Lesson }> {
      const course = await courseRepo.save(
        courseRepo.create({
          title: `Course ${visibility}`,
          description: `Description ${visibility}`,
          level: 'beginner',
          isPublished: true,
          visibility,
        }),
      );

      const courseModule = await moduleRepo.save(
        moduleRepo.create({
          courseId: course.id,
          title: `Module ${visibility}`,
          order: 1,
        }),
      );

      const lesson = await lessonRepo.save(
        lessonRepo.create({
          moduleId: courseModule.id,
          title: `Lesson ${visibility}`,
          content: `Content ${visibility}`,
          order: 0,
        }),
      );

      return { course, courseModule, lesson };
    }

    describe.each(visibilityLevels)('visibility: %s', (visibility) => {
      let course: Course;
      let courseModule: CourseModule;
      let lesson: Lesson;

      beforeEach(async () => {
        ({ course, courseModule, lesson } = await createCourseWithVisibility(
          visibility,
        ));
      });

      describe('course detail endpoint', () => {
        it('handles unauthenticated access according to visibility', async () => {
          const canView = await accessControlService.canViewCourse(
            course.id,
            undefined,
          );

          if (visibility === 'public' || visibility === 'unlisted') {
            expect(canView).toBe(true);
          } else {
            expect(canView).toBe(false);
          }
        });

        it('handles non-enrolled authenticated access according to visibility', async () => {
          const canView = await accessControlService.canViewCourse(
            course.id,
            nonEnrolledLearner,
          );

          if (visibility === 'public' || visibility === 'unlisted') {
            expect(canView).toBe(true);
          } else {
            expect(canView).toBe(false);
          }
        });

        it('allows enrolled learner access', async () => {
          const canView = await accessControlService.canViewCourse(
            course.id,
            enrolledLearner,
          );

          expect(canView).toBe(true);
        });
      });

      describe('lesson endpoint', () => {
        it('handles unauthenticated access according to visibility', async () => {
          const canView = await accessControlService.canViewLesson(
            lesson.id,
            undefined,
          );

          if (visibility === 'public' || visibility === 'unlisted') {
            expect(canView).toBe(true);
          } else {
            expect(canView).toBe(false);
          }
        });

        it('handles non-enrolled authenticated access according to visibility', async () => {
          const canView = await accessControlService.canViewLesson(
            lesson.id,
            nonEnrolledLearner,
          );

          if (visibility === 'public' || visibility === 'unlisted') {
            expect(canView).toBe(true);
          } else {
            expect(canView).toBe(false);
          }
        });

        it('allows enrolled learner access', async () => {
          const canView = await accessControlService.canViewLesson(
            lesson.id,
            enrolledLearner,
          );

          expect(canView).toBe(true);
        });
      });

      describe('resource endpoint', () => {
        it('handles unauthenticated access according to visibility', async () => {
          const canView = await accessControlService.canViewResource(
            course.id,
            undefined,
          );

          if (visibility === 'public' || visibility === 'unlisted') {
            expect(canView).toBe(true);
          } else {
            expect(canView).toBe(false);
          }
        });

        it('handles non-enrolled authenticated access according to visibility', async () => {
          const canView = await accessControlService.canViewResource(
            course.id,
            nonEnrolledLearner,
          );

          if (visibility === 'public' || visibility === 'unlisted') {
            expect(canView).toBe(true);
          } else {
            expect(canView).toBe(false);
          }
        });

        it('allows enrolled learner access', async () => {
          const canView = await accessControlService.canViewResource(
            course.id,
            enrolledLearner,
          );

          expect(canView).toBe(true);
        });
      });
    });

    it('excludes private courses from search results', async () => {
      const publicCourse = await createCourseWithVisibility('public');
      const unlistedCourse = await createCourseWithVisibility('unlisted');
      const enrolledOnlyCourse = await createCourseWithVisibility('enrolled_only');
      const privateCourse = await createCourseWithVisibility('private');

      const visibleCourseIds = await accessControlService.filterVisibleCourses(
        [
          publicCourse.course.id,
          unlistedCourse.course.id,
          enrolledOnlyCourse.course.id,
          privateCourse.course.id,
        ],
        undefined,
      );

      expect(visibleCourseIds).toContain(publicCourse.course.id);
      expect(visibleCourseIds).toContain(unlistedCourse.course.id);
      expect(visibleCourseIds).not.toContain(enrolledOnlyCourse.course.id);
      expect(visibleCourseIds).not.toContain(privateCourse.course.id);
    });

    it('excludes private courses from search results for non-enrolled users', async () => {
      const privateCourse = await createCourseWithVisibility('private');

      const visibleCourseIds = await accessControlService.filterVisibleCourses(
        [privateCourse.course.id],
        nonEnrolledLearner,
      );

      expect(visibleCourseIds).not.toContain(privateCourse.course.id);
    });

    it('includes enrolled_only courses in search results for enrolled learners', async () => {
      const enrolledOnlyCourse = await createCourseWithVisibility('enrolled_only');

      const visibleCourseIds = await accessControlService.filterVisibleCourses(
        [enrolledOnlyCourse.course.id],
        enrolledLearner,
      );

      expect(visibleCourseIds).toContain(enrolledOnlyCourse.course.id);
    });
  });
});
