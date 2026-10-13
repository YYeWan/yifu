export const clothingTypes=[
 ['top','上衣','tops'],['coat','外套','tops'],['pants','裤子','bottoms'],['skirt','裙子','bottoms'],['dress','连衣裙','tops'],['shoes','鞋子','shoes'],['hat','帽子','accessories'],['bag','包袋','accessories'],['accessory','配饰','accessories']
];
export function clothingCategory(type){const found=clothingTypes.find(x=>x[0]===type);if(!found)throw Error('请选择服饰类型');return found[2];}
export function guessClothingType(name){const rules=[['coat',/外套|夹克|coat|jacket/i],['pants',/裤|pants|jeans/i],['dress',/连衣裙|dress/i],['skirt',/裙|skirt/i],['shoes',/鞋|靴|shoe|boot/i],['hat',/帽|hat|cap/i],['bag',/包|bag/i],['accessory',/项链|耳环|手链|眼镜|necklace|glasses/i],['top',/上衣|衬衫|毛衣|背心|T恤|shirt|sweater|top/i]];return rules.find(([,pattern])=>pattern.test(name))?.[0]||'';}
export function createPerson({id,name,photo,thumbnail,date}){if(!photo)throw Error('请先选择人物照片');return {id,name:name.trim()||'我的人物',photo,originalPhoto:photo,thumbnail,date};}
