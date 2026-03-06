export type AggregateFunction = "SUM" | "COUNT" | "AVG" | "MAX" | "MIN"
export type QueryStatus = "Running" | "Completed" | "Failed" | "Pending"
export type Operators = "=" | "!=" |  ">" |  "<" | ">=" | "<="

// for where clauses
export interface FilterCondition {
  column : string,
  operator : Operators,
  value : string | number
}
//for org node
export interface QueryDefinition{
  aggregate : AggregateFunction,
  column : string,
  filter ?: Array<FilterCondition>,
  grouping ?: string,
  submitter : string,
}
// for coordinator
export interface QueryRecord extends QueryDefinition{
  id:string,
  status:QueryStatus,
  createdAt : Date
}

// what org node will send back 
export interface QueryResult{
  resultId : string,
  queryId : string, //Response to which query?
  orgId : string,
  result : number,
  noise : number, // noise added
  epsilon : number 
}

// If an org wants to join a network
export interface OrgJoining{
  orgId : string,
  orgName : string,
  endpoint : string,
  privacyBudget : number
}

// For commit-reveal protocol
export interface Commitment{
  queryId : string,
  orgId : string,
  hashedResult : string,
  hashRevealed : boolean,
  submittedAt : Date
}

//Audit log
export interface AuditLog{
  logId : string,
  action : string,
  actionCommitter : string,
  when : Date,
  queryId ?: string,
  extraDetails ?: string
}