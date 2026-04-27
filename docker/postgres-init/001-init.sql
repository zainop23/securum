/* Coordinator DB tables */
create table organizations(
    id uuid primary key default gen_random_uuid(),
    name varchar(250) unique not null,
    api_key_hash varchar(250) not null,
    endpoint_url varchar(512) not null,
    status varchar(20) not null default 'active' check (status in ('active','inactive','pending')),
    created_at timestamptz default NOW()
);

create table queries(
    id uuid primary key default gen_random_uuid(),
    submitted_by varchar(255) not null,
    query_definition jsonb not null,
    status varchar(20) not null default 'pending' check (status in ('pending','committing','revealing','done','failed')),
    quorum integer default 2,
    epsilon numeric(10,4) default 1.0,
    created_at timestamptz default NOW()
);

create table commitments(
    id uuid primary key default gen_random_uuid(),
    query_id uuid not null references queries(id),
    org_id uuid not null references organizations(id),
    commitment_hash varchar(255) not null,
    revealed_value jsonb,
    revealed_nonce varchar(255),
    verified boolean default false,
    committed_at timestamptz default NOW(),
    revealed_at timestamptz,
    unique(query_id, org_id)
);

create table audit_logs(
    id uuid primary key default gen_random_uuid(),
    query_id uuid references queries(id),
    org_id uuid references organizations(id),
    event_type varchar(100) not null,
    payload jsonb,
    created_at timestamptz default NOW()
);

create table results(
    id uuid primary key default gen_random_uuid(),
    query_id uuid not null unique references queries(id),
    global_result jsonb not null,
    created_at timestamptz default NOW()
);

create table privacy_budget(
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id),
    query_id uuid not null references queries(id),
    epsilon_spent numeric(10,4) not null,
    created_at timestamptz default NOW(),
    unique(org_id, query_id)
);

/* Indexes for fast lookups */
create index idx_privacy_budget_org on privacy_budget(org_id);
create index idx_commitments_query on commitments(query_id);
create index idx_audit_logs_query on audit_logs(query_id);