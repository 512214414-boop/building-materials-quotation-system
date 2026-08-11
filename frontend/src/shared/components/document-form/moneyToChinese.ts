/**
 * 金额转大写中文
 * 用于单据页脚显示
 */

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const BIG_UNITS = ['', '万', '亿', '兆'];

/**
 * 将数字金额转换为大写中文金额
 * @param amount 金额数字（支持小数点后两位）
 * @returns 大写中文金额字符串
 * @example
 *   moneyToChinese(1234.56) // => "壹仟贰佰叁拾肆元伍角陆分"
 *   moneyToChinese(100) // => "壹佰元整"
 */
export function moneyToChinese(amount: number): string {
  if (amount === 0) return '零元整';
  
  // 处理负数
  if (amount < 0) {
    return '负' + moneyToChinese(Math.abs(amount));
  }
  
  // 分离整数和小数部分
  const [integerPart, decimalPart] = amount.toFixed(2).split('.').map(Number);
  
  let result = '';
  
  // 处理整数部分
  if (integerPart > 0) {
    result += convertIntegerPart(integerPart) + '元';
  }
  
  // 处理小数部分
  if (decimalPart > 0) {
    const jiao = Math.floor(decimalPart / 10);
    const fen = decimalPart % 10;
    
    if (jiao > 0) {
      result += DIGITS[jiao] + '角';
    }
    if (fen > 0) {
      result += DIGITS[fen] + '分';
    }
  } else if (integerPart > 0) {
    // 没有小数部分且整数部分大于0，加"整"
    result += '整';
  }
  
  return result;
}

/**
 * 转换整数部分
 */
function convertIntegerPart(num: number): string {
  if (num === 0) return '';
  
  let result = '';
  let unitIndex = 0;
  
  while (num > 0) {
    const section = num % 10000;
    if (section > 0) {
      const sectionStr = convertSection(section);
      result = sectionStr + BIG_UNITS[unitIndex] + result;
    }
    num = Math.floor(num / 10000);
    unitIndex++;
  }
  
  return result;
}

/**
 * 转换四位数字段
 */
function convertSection(num: number): string {
  if (num === 0) return '';
  
  let result = '';
  let zeroFlag = false;
  
  for (let i = 0; i < 4 && num > 0; i++) {
    const digit = num % 10;
    num = Math.floor(num / 10);
    
    if (digit === 0) {
      zeroFlag = true;
    } else {
      if (zeroFlag) {
        result = DIGITS[0] + result;
        zeroFlag = false;
      }
      result = DIGITS[digit] + UNITS[i] + result;
    }
  }
  
  return result;
}