-- v26：登录账号跟默认联系走，授权码/准入申请的绑定值加长到与联系 value 同宽
ALTER TABLE `authorization_codes`
  MODIFY COLUMN `phone` VARCHAR(200) NULL COMMENT '绑定的登录账号（默认联系方式）';

ALTER TABLE `access_requests`
  MODIFY COLUMN `phone` VARCHAR(200) NOT NULL COMMENT '申请登录账号（默认联系方式）';
