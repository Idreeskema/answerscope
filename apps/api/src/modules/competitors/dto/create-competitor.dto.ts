import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateCompetitorDto {
  @ApiProperty()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;
}
