import { RewriterResult, SchemaMap } from "./types";

export function rewriteQuery(sql:string, schemaMap: SchemaMap):RewriterResult{
    let rewrittenSql = sql;
    for(const [globalTable,localTable] of Object.entries(schemaMap.tables)){
        rewrittenSql = replaceWholeWord(rewrittenSql,globalTable,localTable);
    }
    for(const [globalColumn,localColumn] of Object.entries(schemaMap.columns)){
        rewrittenSql = replaceWholeWord(rewrittenSql,globalColumn,localColumn);
    }
    const reverseMap:Record<string,string> = {};
    for(const [globalColumn,localColumn] of Object.entries(schemaMap.columns)){
        reverseMap[localColumn] = globalColumn;
    }
    return {
        sql: rewrittenSql,
        reverseMap
    };
}
function replaceWholeWord(text: string, oldWord: string, newWord: string): string {
  const escapedOldWord = oldWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedOldWord}\\b`, "g");
  return text.replace(regex, newWord);
}