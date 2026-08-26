jest.mock('../services/notificationService', () => ({
  notifyUser: jest.fn(async () => {}),
  notifyUsersWithPermission: jest.fn(async () => {}),
}));

/**
 * A real in-memory fake of the workflow tables, matching exact query text
 * the same way stockService.test.js does. This has to be mocked at the
 * module level (jest.mock('../config/db')) rather than passed as a
 * parameter everywhere, because actOnInstance — unlike submitForApproval —
 * doesn't take a client argument at all; it calls db.getClient() on the
 * module-level db singleton internally. Both code paths need to observe
 * the same underlying state, so this single mock instance is used both as
 * the mocked module and as the explicit client passed into
 * submitForApproval, rather than two disconnected fakes that could drift
 * out of sync with each other.
 */
function createMockDb() {
  const state = {
    definitions: [], // { id, company_id, entity_type, is_active }
    steps: [], // { id, workflow_definition_id, step_number, min_amount, approver_permission_code, name }
    instances: [], // { id, company_id, workflow_definition_id, entity_type, entity_id, amount, status, current_step_number, submitted_by }
    actions: [],
  };
  let instanceSeq = 0;
  let actionSeq = 0;

  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

  const query = jest.fn(async (sql, params = []) => {
    const s = norm(sql);

    if (s === 'SELECT * FROM workflow_definitions WHERE company_id = $1 AND entity_type = $2 AND is_active = TRUE') {
      const [companyId, entityType] = params;
      const row = state.definitions.find((d) => d.company_id === companyId && d.entity_type === entityType && d.is_active);
      return { rows: row ? [row] : [] };
    }

    if (s === 'SELECT * FROM workflow_steps WHERE workflow_definition_id = $1 ORDER BY step_number ASC') {
      const [definitionId] = params;
      const rows = state.steps.filter((st) => st.workflow_definition_id === definitionId).sort((a, b) => a.step_number - b.step_number);
      return { rows };
    }

    if (s.startsWith('INSERT INTO workflow_instances')) {
      const [companyId, workflowDefinitionId, entityType, entityId, amount, currentStepNumber, submittedBy] = params;
      const row = {
        id: `inst-${++instanceSeq}`, company_id: companyId, workflow_definition_id: workflowDefinitionId,
        entity_type: entityType, entity_id: entityId, amount, status: 'pending',
        current_step_number: currentStepNumber, submitted_by: submittedBy,
      };
      state.instances.push(row);
      return { rows: [row] };
    }

    if (s === 'SELECT * FROM workflow_instances WHERE id = $1 AND company_id = $2 FOR UPDATE') {
      const [id, companyId] = params;
      const row = state.instances.find((i) => i.id === id && i.company_id === companyId);
      return { rows: row ? [row] : [] };
    }

    if (s === 'SELECT * FROM workflow_steps WHERE workflow_definition_id = $1 AND step_number = $2') {
      const [definitionId, stepNumber] = params;
      const row = state.steps.find((st) => st.workflow_definition_id === definitionId && st.step_number === stepNumber);
      return { rows: row ? [row] : [] };
    }

    if (s.startsWith('INSERT INTO workflow_instance_actions')) {
      const [instanceId, stepNumber, userId, action, comment] = params;
      state.actions.push({ id: `act-${++actionSeq}`, instanceId, stepNumber, userId, action, comment });
      return { rows: [] };
    }

    if (s === "UPDATE workflow_instances SET status = 'rejected', updated_at = NOW() WHERE id = $1") {
      const [id] = params;
      state.instances.find((i) => i.id === id).status = 'rejected';
      return { rows: [] };
    }

    if (s === "UPDATE workflow_instances SET status = 'approved', updated_at = NOW() WHERE id = $1") {
      const [id] = params;
      state.instances.find((i) => i.id === id).status = 'approved';
      return { rows: [] };
    }

    if (s === 'UPDATE workflow_instances SET current_step_number = $1, updated_at = NOW() WHERE id = $2') {
      const [stepNumber, id] = params;
      state.instances.find((i) => i.id === id).current_step_number = stepNumber;
      return { rows: [] };
    }

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] };

    throw new Error(`Unmocked query in test: ${s}`);
  });

  const instance = { query, getClient: async () => ({ query, release: () => {} }), pool: {}, state };
  return instance;
}

const mockDbInstance = createMockDb();
jest.mock('../config/db', () => mockDbInstance);

const {
  submitForApproval, actOnInstance, registerFinalizeHandler,
} = require('../services/approvalWorkflowService');
const notificationService = require('../services/notificationService');

const COMPANY = 'co-1';

function resetState() {
  mockDbInstance.state.definitions.length = 0;
  mockDbInstance.state.steps.length = 0;
  mockDbInstance.state.instances.length = 0;
  mockDbInstance.state.actions.length = 0;
}

beforeEach(() => {
  resetState();
  // The real module has a production default handler registered for
  // 'purchase_requisition' that updates a real purchase_requisitions
  // table this test file has no reason to mock. Overriding it with a
  // no-op here keeps every test isolated from both that real table and
  // from execution order — finalizeHandlers is shared, mutable module
  // state, not reset automatically between tests. The two tests that
  // specifically verify handler invocation register their own handler
  // locally, which correctly overrides this one for their own run.
  registerFinalizeHandler('purchase_requisition', async () => {});
});

function seedThreeStepWorkflow(entityType = 'purchase_requisition') {
  mockDbInstance.state.definitions.push({ id: 'def-1', company_id: COMPANY, entity_type: entityType, is_active: true });
  mockDbInstance.state.steps.push(
    { id: 'step-1', workflow_definition_id: 'def-1', step_number: 1, min_amount: 0, approver_permission_code: 'approve.level1', name: 'Manager' },
    { id: 'step-2', workflow_definition_id: 'def-1', step_number: 2, min_amount: 1000, approver_permission_code: 'approve.level2', name: 'Finance' },
    { id: 'step-3', workflow_definition_id: 'def-1', step_number: 3, min_amount: 5000, approver_permission_code: 'approve.level3', name: 'Director' }
  );
}

describe('submitForApproval', () => {
  test('no active workflow definition for this entity type means no approval required', async () => {
    const result = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 100 });
    expect(result).toEqual({ requiresApproval: false });
  });

  test('an amount below every step threshold means no approval required', async () => {
    mockDbInstance.state.definitions.push({ id: 'def-1', company_id: COMPANY, entity_type: 'purchase_requisition', is_active: true });
    mockDbInstance.state.steps.push({ id: 'step-1', workflow_definition_id: 'def-1', step_number: 1, min_amount: 1000, approver_permission_code: 'approve.level1', name: 'Manager' });

    const result = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 500 });
    expect(result).toEqual({ requiresApproval: false });
  });

  test('starts at the lowest-numbered step whose threshold the amount meets', async () => {
    seedThreeStepWorkflow();
    const result = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 200 });
    expect(result.requiresApproval).toBe(true);
    expect(result.instance.current_step_number).toBe(1);
  });

  test('a large amount that qualifies for every step still starts at step 1, not the highest step', async () => {
    seedThreeStepWorkflow();
    const result = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 10000 });
    expect(result.instance.current_step_number).toBe(1);
  });

  test('notifies the approvers for the starting step', async () => {
    seedThreeStepWorkflow();
    notificationService.notifyUsersWithPermission.mockClear();

    await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 200, submittedBy: 'user-1' });
    expect(notificationService.notifyUsersWithPermission).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ permissionCode: 'approve.level1' })
    );
  });
});

describe('actOnInstance - permission and state guards', () => {
  test('rejects with 404 if the instance does not exist for this company', async () => {
    await expect(
      actOnInstance({ instanceId: 'nope', companyId: COMPANY, userId: 'u1', permissions: [], action: 'approved' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects with 400 if the instance has already been decided', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 200 });
    mockDbInstance.state.instances.find((i) => i.id === instance.id).status = 'approved';

    await expect(
      actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'approved' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects with 403 if the acting user lacks the permission required for the current step', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 200 });

    await expect(
      actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['some.unrelated.permission'], action: 'approved' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('actOnInstance - rejection', () => {
  test('rejecting sets the instance to rejected and stops the workflow, regardless of later steps', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 10000 });

    const result = await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'rejected', comment: 'no' });
    expect(result).toEqual({ finalStatus: 'rejected' });
    expect(mockDbInstance.state.instances.find((i) => i.id === instance.id).status).toBe('rejected');
  });

  test('a registered finalize handler is called with status rejected and the right entity', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'entity-99', amount: 200 });

    const handler = jest.fn(async () => {});
    registerFinalizeHandler('purchase_requisition', handler);

    await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'rejected' });
    expect(handler).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityId: 'entity-99', status: 'rejected' }));
  });
});

describe('actOnInstance - approval and step progression', () => {
  test('approving a step with a later applicable step advances current_step_number to that step, not just +1', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 6000 });

    const result = await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'approved' });
    expect(result).toEqual({ finalStatus: 'pending', nextStep: 2 });
    expect(mockDbInstance.state.instances.find((i) => i.id === instance.id).current_step_number).toBe(2);
  });

  // The real state-machine correctness this suite exists to prove: a step
  // whose min_amount the submitted amount doesn't reach must be skipped
  // entirely, not silently treated as satisfied just because an earlier
  // step was approved.
  test('a step whose threshold this amount does not meet is skipped when advancing', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 2000 });
    expect(instance.current_step_number).toBe(1);

    const afterStep1 = await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'approved' });
    expect(afterStep1).toEqual({ finalStatus: 'pending', nextStep: 2 });

    const afterStep2 = await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u2', permissions: ['approve.level2'], action: 'approved' });
    expect(afterStep2).toEqual({ finalStatus: 'approved' });
    expect(mockDbInstance.state.instances.find((i) => i.id === instance.id).status).toBe('approved');
  });

  test('approving the last applicable step finalizes the instance as approved', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 200 });

    const result = await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'approved' });
    expect(result).toEqual({ finalStatus: 'approved' });
  });

  test('a registered finalize handler is called with status approved once the workflow completes', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'entity-42', amount: 200 });

    const handler = jest.fn(async () => {});
    registerFinalizeHandler('purchase_requisition', handler);

    await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'approved' });
    expect(handler).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityId: 'entity-42', status: 'approved' }));
  });

  test('notifies the next step approvers when the workflow advances rather than finishes', async () => {
    seedThreeStepWorkflow();
    const { instance } = await submitForApproval(mockDbInstance, { companyId: COMPANY, entityType: 'purchase_requisition', entityId: 'x', amount: 6000 });
    notificationService.notifyUsersWithPermission.mockClear();

    await actOnInstance({ instanceId: instance.id, companyId: COMPANY, userId: 'u1', permissions: ['approve.level1'], action: 'approved' });
    expect(notificationService.notifyUsersWithPermission).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ permissionCode: 'approve.level2' })
    );
  });
});
