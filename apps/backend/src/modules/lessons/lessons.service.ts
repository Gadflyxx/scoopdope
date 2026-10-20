import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from './entities/lesson.entity';
import { Course } from '../courses/entities/course.entity';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';

@Injectable()
export class LessonsService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonsRepository: Repository<Lesson>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
  ) {}

  async create(courseId: string, dto: CreateLessonDto, userId: string): Promise<Lesson> {
    const course = await this.coursesRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.instructorId !== userId) {
      throw new ForbiddenException('Only the course instructor can add lessons');
    }

    const lesson = this.lessonsRepository.create({
      ...dto,
      courseId,
    });
    return this.lessonsRepository.save(lesson);
  }

  async findAll(courseId: string): Promise<Lesson[]> {
    return this.lessonsRepository.find({
      where: { courseId },
      order: { order: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Lesson> {
    const lesson = await this.lessonsRepository.findOne({ where: { id } });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    return lesson;
  }

  async update(id: string, dto: UpdateLessonDto, userId: string): Promise<Lesson> {
    const lesson = await this.findOne(id);
    const course = await this.coursesRepository.findOne({ where: { id: lesson.courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.instructorId !== userId) {
      throw new ForbiddenException('Only the course instructor can update lessons');
    }

    Object.assign(lesson, dto);
    return this.lessonsRepository.save(lesson);
  }

  async reorder(courseId: string, dto: ReorderLessonsDto, userId: string): Promise<Lesson[]> {
    const course = await this.coursesRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.instructorId !== userId) {
      throw new ForbiddenException('Only the course instructor can reorder lessons');
    }

    const lessons = await this.lessonsRepository.find({ where: { courseId } });
    const lessonMap = new Map(lessons.map((lesson) => [lesson.id, lesson]));

    for (const item of dto.lessons) {
      const lesson = lessonMap.get(item.id);
      if (!lesson) {
        throw new NotFoundException(`Lesson ${item.id} not found in this course`);
      }
      lesson.order = item.order;
    }

    return this.lessonsRepository.save(Array.from(lessonMap.values()));
  }

  async remove(id: string, userId: string): Promise<void> {
    const lesson = await this.findOne(id);
    const course = await this.coursesRepository.findOne({ where: { id: lesson.courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.instructorId !== userId) {
      throw new ForbiddenException('Only the course instructor can delete lessons');
    }

    await this.lessonsRepository.remove(lesson);
  }
}
