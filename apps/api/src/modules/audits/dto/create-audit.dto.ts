import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateAuditDto {
  @ApiProperty({ required: false, default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  maxPages?: number;

  @ApiProperty({ required: false, default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxDepth?: number;
}
