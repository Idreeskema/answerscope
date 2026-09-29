import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  importance?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  groupName?: string;

  @ApiProperty({ required: false, enum: ['PENDING', 'APPROVED', 'EDITED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'EDITED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'EDITED' | 'REJECTED';
}
