import { IsDefined, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  @IsDefined()
  email!: string;

  @IsString()
  @MinLength(8)
  @IsDefined()
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class LoginDto {
  @IsEmail()
  @IsDefined()
  email!: string;

  @IsString()
  @IsDefined()
  password!: string;
}
