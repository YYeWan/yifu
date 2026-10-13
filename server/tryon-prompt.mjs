export const TRYON_PROMPT_VERSION='item-checklist-v1';

export function buildTryonInstructions(items){
 const hasHat=items.some(name=>/帽|\b(cap|hat|beanie|beret)\b/i.test(name));
 const hasHeadphones=items.some(name=>/耳机|\bheadphones?\b/i.test(name));
 const placement=name=>{
  if(/帽|\b(cap|hat|beanie|beret)\b/i.test(name))return '戴在头顶，保留帽冠、帽檐、颜色和图案；允许遮住原有部分头发';
  if(/眼镜|墨镜|\b(glasses|sunglasses|eyewear)\b/i.test(name))return '实际佩戴在鼻梁和双眼前，镜框和镜片必须可辨认；不能为了露出眼睛而省略';
  if(/耳机|\bheadphones?\b/i.test(name))return hasHat?'挂在颈部靠后的位置，耳罩可见，给帽子和项链留出位置':'按参考款式佩戴，耳罩与头梁保持完整';
  if(/耳环|耳饰|耳钉|\bearrings?\b/i.test(name))return '佩戴在耳部，可见侧保留款式细节，遵循姿势产生的正常遮挡';
  if(/项链|吊坠|\b(necklace|pendant)\b/i.test(name))return '佩戴在颈部，链条和吊坠在胸前可辨认，不被耳机完全遮住';
  if(/袜|\bsocks?\b/i.test(name))return '穿在腿脚上，保留长度、颜色和装饰，与所选鞋子同时出现';
  if(/包|\b(bag|handbag|backpack)\b/i.test(name))return '按参考包型自然携带，包身与包带可辨认';
  return '按该单品的实际用途穿戴，保留颜色、纹理、版型和装饰';
 };
 const referenceMap=items.map((name,i)=>`图${i+2}：${name}`).join('；');
 const checklist=items.map((name,i)=>`${i+1}. 图${i+2}「${name}」：${placement(name)}。`).join('\n');
 return `无论参考图背景是什么颜色，输出背景与人物脚下均必须为纯白 RGB(255,255,255)，无投影、反光、渐变或灰色区域。
图1是需要换装的人物；从图2开始是独立单品参考：${referenceMap}。
任务是将全部 ${items.length} 件选中单品穿戴到图1的同一个人身上。这是必须全部完成的清单，不是供挑选的灵感图。衣服和小配饰同等重要，不能只保留主要衣物，不能忽略靠后的参考图，不能自行减少件数或用相近款替代。
逐件穿戴清单：
${checklist}
保留图1的人物身份、面部五官结构、体型、身体比例、原始姿势和朝向。保留发色和基本发型，但允许帽子自然覆盖头发、眼镜自然覆盖眼睛；保留身份不意味着必须露出完整头发和双眼。不能为了保留原图外观而取消所选配饰。
${hasHat&&hasHeadphones?'本套同时选择帽子和耳机：帽子戴在头上，耳机挂在颈部，两者必须同时存在，不能二选一。\n':''}移除原图中未选中的原有服装、袜子及配饰；只有指定了鞋子才换鞋，否则保留图1的原鞋。不要新增清单外单品。保持真实合理的穿着褶皱和遮挡，不能以消失或融合的方式解决遮挡。
输出前按照上面 ${items.length} 项清单逐项核对，尤其检查帽子、眼镜、耳饰、项链、耳机、袜子和包是否实际出现在人物对应位置；如有遗漏，在输出前补齐。只输出一张完整全身穿搭图，从头顶到鞋底均在画面内；不得用文字、编号、拼贴小图或旁边摆放的单品代替实际穿戴。`;
}
