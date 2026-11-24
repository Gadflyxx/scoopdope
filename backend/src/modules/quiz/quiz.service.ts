import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuizAttempt } from './entities/quiz-attempt.entity';
import { Quiz } from './entities/quiz.entity';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { ReputationService } from '../reputation/reputation.service';

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizAttempt)
    private readonly attemptRepository: Repository<QuizAttempt>,
    private readonly reputationService: ReputationService,
  ) {}

  async submitQuiz(userId: string, quizId: string, dto: SubmitQuizDto): Promise<QuizAttempt> {
    const quiz = await this.quizRepository.findOne({ where: { id: quizId } });
    if (!quiz) {
      throw new Error(`Quiz ${quizId} not found`);
    }

    const score = this.calculateScore(quiz, dto.answers);
    const passed = score >= quiz.passingScore;

    const attempt = this.attemptRepository.create({
      userId,
      quizId,
      score,
      passed,
      answers: dto.answers,
    });

    const saved = await this.attemptRepository.save(attempt);

    // Reputation-affecting event: quiz completion. Queue the score delta so the
    // ReputationService can batch it into a single on-chain submission.
    try {
      await this.reputationService.queueScoreUpdate(userId, this.computeReputationDelta(score, passed));
    } catch (error) {
      this.logger.error(`Failed to queue reputation update for user ${userId}: ${error.message}`);
    }

    return saved;
  }

  private calculateScore(quiz: Quiz, answers: Record<string, string>): number {
    const questions = quiz.questions ?? [];
    if (questions.length === 0) {
      return 0;
    }

    let correct = 0;
    for (const question of questions) {
      if (answers[question.id] === question.correctAnswer) {
        correct += 1;
      }
    }

    return Math.round((correct / questions.length) * 100);
  }

  private computeReputationDelta(score: number, passed: boolean): number {
    if (!passed) {
      return 0;
    }
    // Base reward for passing plus a bonus proportional to the score.
    return 10 + Math.floor(score / 10);
  }
}
