import { ValidatorResult } from "./types";
import { QueryDefinition } from "./types";
import { RewriterResult } from "./types";
import { GLOBAL_SCHEMA } from "./constants";
import { SchemaMap } from "./types";
import { SUPPORTED_AGGREGATES } from "./constants";
export function validateAndBuildQuery(query: QueryDefinition):ValidatorResult{
    if(!SUPPORTED_AGGREGATES.includes(query.aggregate)){
        return {valid:false, error:`Unsupported aggregate: ${query.aggregate}`};
    }
    const table = 'transactions';
    if (!GLOBAL_SCHEMA[table]){
        return {valid: false, error:`Table '${table}' not found in global schema`};
    }
    const allowedColumns = GLOBAL_SCHEMA[table];
    if(!allowedColumns.includes(query.column)){
        return {valid:false,error:`Column ${query.column} is not in the schema for '${table}'`}
    }
    if (query.grouping !== undefined && !allowedColumns.includes(query.grouping)){
        return {valid:false,error:`Grouping column ${query.grouping} is not in the global schema for table '${table}'`}
    }
    if (query.filter !== undefined) {
        for (const f of query.filter) {
            if (!allowedColumns.includes(f.column)) {
                return { valid: false, error: `Filter column '${f.column}' is not in the global schema for table '${table}'` };
            }
        }
    }
    let whereClause=''
    if(query.filter && query.filter.length > 0){
        const conditions = query.filter.map(f => `${f.column} ${f.operator} '${f.value}'`)
        whereClause = ` WHERE ${conditions.join(' AND ')}`;
    }
    let selectExpr:string;
    if(query.aggregate === 'AVG'){
        selectExpr = `SUM(${query.column}) AS sum, COUNT(${query.column}) AS count`;
    }else{
        selectExpr = `${query.aggregate}(${query.column})`;
    }
    let sql:string;
    if(query.grouping){
        sql=`SELECT ${query.grouping}, ${selectExpr} FROM ${table}${whereClause} GROUP BY ${query.grouping}`;
    }else{
        sql =`SELECT ${selectExpr} FROM ${table}${whereClause}`;
    }
    return {valid:true, sql};
}