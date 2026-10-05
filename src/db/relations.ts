import {
    defineRelations,
    defineRelationsPart,
} from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema);

export const authRelations = defineRelationsPart(schema, (r) => ({
    user: {
        sessions: r.many.session(),
        accounts: r.many.account(),
    },

    session: {
        user: r.one.user({
            from: r.session.userId,
            to: r.user.id,
            optional: false,
        }),
    },

    account: {
        user: r.one.user({
            from: r.account.userId,
            to: r.user.id,
            optional: false,
        }),
    },
}));