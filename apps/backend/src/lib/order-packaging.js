'use strict';

// Match persisted order types, never product names or customer notes.
function usesPackaging(orderType) { return orderType !== 'DINE_IN'; }

module.exports = { usesPackaging };
