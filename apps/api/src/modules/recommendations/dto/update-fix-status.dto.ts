import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateFixStatusDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'APPLIED'] })
  @IsIn(['APPROVED', 'REJECTED', 'APPLIED'])
  status: 'APPROVED' | 'REJECTED' | 'APPLIED';
}
