import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchAnalytic } from './search-analytic.entity';
import { Course } from '../courses/course.entity';
import { Lesson } from '../courses/lesson.entity';
import { Post } from '../forums/post.entity';
import { User } from '../users/user.entity';

export type IndexName = 'courses' | 'lessons' | 'posts' | 'users';

export type SearchResultType = 'course' | 'lesson' | 'instructor';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  score: number;
  title?: string;
  description?: string;
  content?: string;
  username?: string;
  bio?: string;
  avatar?: string;
  highlight?: Record<string, string[]>;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly es: ElasticsearchService,
    @InjectRepository(SearchAnalytic)
    private readonly analyticsRepo: Repository<SearchAnalytic>,
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>
  ) {}

  onModuleInit() {
    void this.ensureIndices().catch((error: unknown) => {
      this.logger.error(
        'Failed to initialize search indices',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  // ─── Index management ──────────────────────────────────────────────────────

  private async ensureIndices() {
    const indices: Record<IndexName, object> = {
      courses: {
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'standard', copy_to: 'suggest' },
            description: { type: 'text', analyzer: 'standard' },
            level: { type: 'keyword' },
            language: { type: 'keyword' },
            durationHours: { type: 'float' },
            isPublished: { type: 'boolean' },
            suggest: { type: 'completion' },
          },
        },
      },
      lessons: {
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'standard', copy_to: 'suggest' },
            content: { type: 'text', analyzer: 'standard' },
            moduleId: { type: 'keyword' },
            durationMinutes: { type: 'integer' },
            suggest: { type: 'completion' },
          },
        },
      },
      posts: {
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'standard', copy_to: 'suggest' },
            content: { type: 'text', analyzer: 'standard' },
            courseId: { type: 'keyword' },
            userId: { type: 'keyword' },
            suggest: { type: 'completion' },
          },
        },
      },
      users: {
        mappings: {
          properties: {
            username: { type: 'text', analyzer: 'standard', copy_to: 'suggest' },
            bio: { type: 'text', analyzer: 'standard' },
            role: { type: 'keyword' },
            avatar: { type: 'keyword' },
            suggest: { type: 'completion' },
          },
        },
      },
    };

    for (const [index, body] of Object.entries(indices)) {
      try {
        const exists = await this.es.indices.exists({ index });
        if (!exists) {
          await this.es.indices.create({ index, ...body });
          this.logger.log(`Created ES index: ${index}`);
        }
      } catch (err) {
        this.logger.warn(`Failed to ensure index ${index}: ${err}`);
      }
    }
  }

  // ─── Indexing ──────────────────────────────────────────────────────────────

  async indexCourse(course: Course) {
    await this.es.index({
      index: 'courses',
      id: course.id,
      document: {
        title: course.title,
        description: course.description,
        level: course.level,
        language: course.language,
        durationHours: course.durationHours,
        isPublished: course.isPublished,
        suggest: { input: [course.title] },
      },
    });
  }

  async indexLesson(lesson: Lesson) {
    await this.es.index({
      index: 'lessons',
      id: lesson.id,
      document: {
        title: lesson.title,
        content: lesson.content,
        moduleId: lesson.moduleId,
        durationMinutes: lesson.durationMinutes,
        suggest: { input: [lesson.title] },
      },
    });
  }

  async indexPost(post: Post) {
    await this.es.index({
      index: 'posts',
      id: post.id,
      document: {
        title: post.title,
        content: post.content,
        courseId: post.courseId,
        userId: post.userId,
        suggest: { input: [post.title] },
      },
    });
  }

  async indexInstructor(user: User) {
    await this.es.index({
      index: 'users',
      id: user.id,
      document: {
        username: user.username,
        bio: user.bio,
        role: user.role,
        avatar: user.avatar,
        suggest: { input: [user.username] },
      },
    });
  }

  async deleteFromIndex(index: IndexName, id: string) {
    try {
      await this.es.delete({ index, id });
    } catch {
      // ignore 404 — document may not have been indexed
    }
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  /**
   * Full-text search across courses, lessons and instructor profiles using
   * Postgres full-text search. Results are filtered by `type` when provided
   * and ranked by ts_rank descending.
   */
  async search(
    query: string,
    type?: SearchResultType,
    userId?: string
  ): Promise<{ total: number; hits: SearchResult[] }> {
    const trimmed = (query ?? '').trim();
    if (!trimmed) {
      return { total: 0, hits: [] };
    }

    const hits: SearchResult[] = [];

    if (!type || type === 'course') {
      const rows = await this.courseRepo
        .createQueryBuilder('c')
        .select('c.id', 'id')
        .addSelect('c.title', 'title')
        .addSelect('c.description', 'description')
        .addSelect(
          `ts_rank(to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.description, '')), plainto_tsquery('english', :q))`,
          'rank'
        )
        .where(
          `to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.description, '')) @@ plainto_tsquery('english', :q)`,
          { q: trimmed }
        )
        .getRawMany<{ id: string; title: string; description: string; rank: string }>();

      for (const row of rows) {
        hits.push({
          id: row.id,
          type: 'course',
          score: Number(row.rank),
          title: row.title,
          description: row.description,
        });
      }
    }

    if (!type || type === 'lesson') {
      const rows = await this.lessonRepo
        .createQueryBuilder('l')
        .select('l.id', 'id')
        .addSelect('l.title', 'title')
        .addSelect('l.content', 'content')
        .addSelect(
          `ts_rank(to_tsvector('english', coalesce(l.title, '') || ' ' || coalesce(l.content, '')), plainto_tsquery('english', :q))`,
          'rank'
        )
        .where(
          `to_tsvector('english', coalesce(l.title, '') || ' ' || coalesce(l.content, '')) @@ plainto_tsquery('english', :q)`,
          { q: trimmed }
        )
        .getRawMany<{ id: string; title: string; content: string; rank: string }>();

      for (const row of rows) {
        hits.push({
          id: row.id,
          type: 'lesson',
          score: Number(row.rank),
          title: row.title,
          content: row.content,
        });
      }
    }

    if (!type || type === 'instructor') {
      const rows = await this.userRepo
        .createQueryBuilder('u')
        .select('u.id', 'id')
        .addSelect('u.username', 'username')
        .addSelect('u.bio', 'bio')
        .addSelect('u.avatar', 'avatar')
        .addSelect(
          `ts_rank(to_tsvector('english', coalesce(u.username, '') || ' ' || coalesce(u.bio, '')), plainto_tsquery('english', :q))`,
          'rank'
        )
        .where('u.role = :role', { role: 'instructor' })
        .andWhere(
          `to_tsvector('english', coalesce(u.username, '') || ' ' || coalesce(u.bio, '')) @@ plainto_tsquery('english', :q)`,
          { q: trimmed }
        )
        .getRawMany<{
          id: string;
          username: string;
          bio: string;
          avatar: string;
          rank: string;
        }>();

      for (const row of rows) {
        hits.push({
          id: row.id,
          type: 'instructor',
          score: Number(row.rank),
          username: row.username,
          bio: row.bio,
          avatar: row.avatar,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    const limited = hits.slice(0, 20);

    await this.trackAnalytic(trimmed, limited.length, userId);
    return { total: limited.length, hits: limited };
  }

  // ─── Autocomplete ──────────────────────────────────────────────────────────

  async autocomplete(
    prefix: string,
    indices: IndexName[] = ['courses', 'lessons', 'posts', 'users']
  ) {
    const response = await this.es.search({
      index: indices.join(','),
      suggest: {
        suggestions: {
          prefix,
          completion: { field: 'suggest', size: 5, skip_duplicates: true, fuzzy: { fuzziness: 1 } },
        },
      },
      _source: ['title'],
      size: 0,
    });

    interface ElasticsearchSuggestionOption {
      text: string;
      _index: string;
      _id: string;
    }

    interface ElasticsearchSuggestion {
      options?: ElasticsearchSuggestionOption[];
    }

    const suggestions =
      (response.suggest?.['suggestions'] as ElasticsearchSuggestion[] | undefined)?.flatMap((s) =>
        (s.options ?? []).map((o) => ({ text: o.text, index: o._index, id: o._id }))
      ) ?? [];

    return suggestions;
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  private async trackAnalytic(query: string, resultsCount: number, userId?: string) {
    try {
      await this.analyticsRepo.save(
        this.analyticsRepo.create({ query, resultsCount, userId: userId ?? null })
      );
    } catch {
      // non-critical
    }
  }

  async trackClick(query: string, resultId: string, resultType: string, userId?: string) {
    await this.analyticsRepo.save(
      this.analyticsRepo.create({
        query,
        resultsCount: 0,
        clickedResultId: resultId,
        clickedResultType: resultType,
        userId: userId ?? null,
      })
    );
  }

  async getTopQueries(limit = 10) {
    return this.analyticsRepo
      .createQueryBuilder('a')
      .select('a.query', 'query')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.query')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();
  }
}
