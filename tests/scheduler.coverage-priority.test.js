const test = require('node:test');
const assert = require('node:assert/strict');

const scenarioCommon = require('../scripts/scheduler-scenario-common');

function findScenario(name) {
  return scenarioCommon.buildAuditScenarios().find((scenario) => scenario.name === name)
    || scenarioCommon.buildRepresentativeScenarios().find((scenario) => scenario.name === name);
}

test('scheduler audit matrix includes squad 10v10/20m/4c coverage-first case', () => {
  const scenario = findScenario('squad equal 10v10/20m/4c');
  assert.ok(scenario);
  assert.equal(scenario.coverageFirstExceptionId, 'squad-10v10-20m-4c');
});

test('accepted coverage-first exceptions are tracked without inflating warnings', () => {
  const scenarios = [
    findScenario('rotation template 6p-1c@18'),
    findScenario('rotation template 9p-2c@18'),
    findScenario('squad equal 10v10/20m/4c')
  ];
  const results = scenarios.map((scenario) => scenarioCommon.runScenario(scenario));

  results.forEach((result) => {
    const evaluation = scenarioCommon.evaluateScenario(result);
    assert.equal(
      evaluation.warnings.some((item) => item.code === 'max_consecutive'),
      false,
      result.scenario.name
    );
  });

  const exceptionRows = scenarioCommon.buildCoverageFirstExceptionRows(results);
  assert.deepEqual(
    exceptionRows.map((row) => row.id),
    ['rotation-6p-1c', 'rotation-9p-2c', 'squad-10v10-20m-4c']
  );
  const rowMap = Object.fromEntries(exceptionRows.map((row) => [row.id, row]));
  assert.equal(rowMap['rotation-6p-1c'].structureLimit, 3);
  assert.equal(rowMap['rotation-6p-1c'].maxConsecutivePlay, 4);
  assert.equal(rowMap['rotation-9p-2c'].structureLimit, 8);
  assert.equal(rowMap['rotation-9p-2c'].maxConsecutivePlay, 8);
  assert.equal(rowMap['squad-10v10-20m-4c'].structureLimit, 3);
  assert.ok(rowMap['squad-10v10-20m-4c'].maxConsecutivePlay >= 4);
});
