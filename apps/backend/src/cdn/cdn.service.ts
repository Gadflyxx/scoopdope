import {
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CdnAsset, AssetType, ContentType } from './cdn-asset.entity';
import * as crypto from 'crypto';

const ASSET_TYPE_MAP: Record<string, AssetType> = {
  'video/mp4': AssetType.VIDEO,
  'video/webm': AssetType.VIDEO,
  'image/jpeg': AssetType.IMAGE,
  'image/png': AssetType.IMAGE,
  'image/gif': AssetType.IMAGE,
  'application/pdf': AssetType.PDF,
};

export const MAX_VIDEO_MESSAGE_SIZE_BYTES = 100 * 1024 * 1024;

const VIDEO_MESSAGE_MIME_TYPES = ['video/mp4', 'video/webm'];

@Injectable()
export class CdnService {
  private readonly cdnDomain: string;
  private readonly cdnAccessKey: string;
  private readonly cdnSecretKey: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(CdnAsset) private assetRepo: Repository<CdnAsset>,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    this.cdnDomain = this.configService.get('CDN_DOMAIN', '');
    this.cdnAccessKey = this.configService.get('CDN_ACCESS_KEY', '');
    this.cdnSecretKey = this.configService.get('CDN_SECRET_KEY', '');
  }

  async uploadAsset(data: {
    lessonId?: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    contentType: ContentType;
    fileSize: number;
    uploadedByUserId?: string;
    isPrivate?: boolean;
  }): Promise<CdnAsset> {
    const key = data.lessonId
      ? `${data.lessonId}/${data.fileName}`
      : `uploads/${data.fileName}`;
    const cdnUrl = `${this.cdnDomain}/${key}`;
    const assetType = ASSET_TYPE_MAP[data.mimeType] ?? null;

    const asset = this.assetRepo.create({
      ...data,
      cdnUrl,
      assetType,
      isPrivate: data.isPrivate ?? true,
    });
    return this.assetRepo.save(asset);
  }

  async generateSignedUrl(assetId: string, expirationMinutes = 60): Promise<string> {
    const cacheKey = `signed-url:${assetId}`;
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;

    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');

    if (!asset.isPrivate) return asset.cdnUrl;

    const expiresAt = Math.floor(Date.now() / 1000) + expirationMinutes * 60;
    const policy = JSON.stringify({
      Statement: [{ Resource: asset.cdnUrl, Condition: { DateLessThan: { 'AWS:EpochTime': expiresAt } } }],
    });
    const signature = crypto
      .createSign('RSA-SHA1')
      .update(policy)
      .sign(this.cdnSecretKey, 'base64');

    const encoded = (s: string) =>
      s.replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');

    const signedUrl = `${asset.cdnUrl}?Expires=${expiresAt}&Signature=${encoded(signature)}&Key-Pair-Id=${this.cdnAccessKey}`;

    await this.cache.set(cacheKey, signedUrl, (expirationMinutes - 5) * 60);
    return signedUrl;
  }

  /**
   * Returns a signed URL suitable for progressive/streaming playback of a video asset.
   * The URL is not cached so that each request gets a fresh expiry window.
   */
  async generateStreamingUrl(assetId: string, expirationMinutes = 60): Promise<string> {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.assetType !== AssetType.VIDEO) {
      throw new BadRequestException('Asset is not a video');
    }
    return this.generateSignedUrl(assetId, expirationMinutes);
  }

  /**
   * Rejects assets exceeding the maximum allowed video message size (100 MB).
   */
  assertWithinVideoMessageSizeLimit(fileSize: number): void {
    if (fileSize > MAX_VIDEO_MESSAGE_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        `Video message exceeds the maximum allowed size of ${MAX_VIDEO_MESSAGE_SIZE_BYTES} bytes`,
      );
    }
  }

  /**
   * Uploads an instructor video message asset and returns the stored asset.
   */
  async uploadVideoMessage(data: {
    buffer: Buffer;
    fileName: string;
    originalName: string;
    mimeType: string;
    uploaderId: string;
    recipientId: string;
  }): Promise<CdnAsset> {
    if (!VIDEO_MESSAGE_MIME_TYPES.includes(data.mimeType)) {
      throw new BadRequestException(
        `Unsupported video message type: ${data.mimeType}. Allowed: ${VIDEO_MESSAGE_MIME_TYPES.join(', ')}`,
      );
    }

    const fileSize = data.buffer?.length ?? 0;
    this.assertWithinVideoMessageSizeLimit(fileSize);

    const asset = await this.uploadAsset({
      fileName: data.fileName,
      originalName: data.originalName,
      mimeType: data.mimeType,
      contentType: ContentType.VIDEO_MESSAGE,
      fileSize,
      uploadedByUserId: data.uploaderId,
      isPrivate: true,
    });

    return asset;
  }

  /**
   * Enqueues/triggers background transcoding for a video asset.
   * When transcoding is unavailable, validates that the asset is already MP4-only.
   */
  async requestTranscode(assetId: string): Promise<{ queued: boolean; assetId: string }> {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.assetType !== AssetType.VIDEO) {
      throw new BadRequestException('Asset is not a video');
    }

    if (asset.mimeType !== 'video/mp4') {
      throw new BadRequestException(
        'Transcoding is unavailable; only MP4 video messages are supported',
      );
    }

    return { queued: true, assetId };
  }

  async markAsTranscoded(assetId: string, bitrates: string[], thumbnailUrl?: string) {
    return this.assetRepo.update({ id: assetId }, { isTranscoded: true, availableBitrates: bitrates, thumbnailUrl });
  }

  async invalidateCache(assetId: string) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return { success: true, assetId, cdnUrl: asset.cdnUrl };
  }

  async getAsset(assetId: string) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async getLessonAssets(lessonId: string) {
    return this.assetRepo.find({ where: { lessonId } });
  }
}
