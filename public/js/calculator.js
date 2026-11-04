(function () {
  var tuition = document.getElementById('calcTuition');
  var students = document.getElementById('calcStudents');
  var investment = document.getElementById('calcInvestment');
  var margin = document.getElementById('calcMargin');
  if (!tuition || !students || !investment || !margin) return;

  var tuitionValue = document.getElementById('calcTuitionValue');
  var studentsValue = document.getElementById('calcStudentsValue');
  var investmentValue = document.getElementById('calcInvestmentValue');
  var marginValue = document.getElementById('calcMarginValue');

  var grossRevenueEl = document.getElementById('calcGrossRevenue');
  var contributionEl = document.getElementById('calcContribution');
  var breakevenEl = document.getElementById('calcBreakeven');
  var balanceEl = document.getElementById('calcBalance');

  function formatCOP(value) {
    return '$' + Math.round(value).toLocaleString('es-CO');
  }

  function paintSliderFill(input) {
    var min = Number(input.min);
    var max = Number(input.max);
    var pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.background =
      'linear-gradient(to right, var(--violet) 0%, var(--violet) ' + pct + '%, var(--border-2) ' + pct + '%, var(--border-2) 100%)';
  }

  function recalculate() {
    var tuitionAmount = Number(tuition.value);
    var studentCount = Number(students.value);
    var investmentAmount = Number(investment.value);
    var marginPct = Number(margin.value) / 100;

    var grossRevenue = tuitionAmount * studentCount;
    var contribution = grossRevenue * marginPct;
    var contributionPerStudent = tuitionAmount * marginPct;
    var breakeven = contributionPerStudent > 0 ? Math.ceil(investmentAmount / contributionPerStudent) : 0;
    var balance = contribution - investmentAmount;

    tuitionValue.textContent = formatCOP(tuitionAmount);
    studentsValue.textContent = studentCount.toLocaleString('es-CO');
    investmentValue.textContent = formatCOP(investmentAmount);
    marginValue.textContent = margin.value + '%';

    grossRevenueEl.textContent = formatCOP(grossRevenue);
    contributionEl.textContent = formatCOP(contribution);
    breakevenEl.textContent = breakeven.toLocaleString('es-CO');
    balanceEl.textContent = formatCOP(balance);
    balanceEl.classList.toggle('calc-result-negative', balance < 0);

    paintSliderFill(tuition);
    paintSliderFill(students);
    paintSliderFill(investment);
    paintSliderFill(margin);
  }

  [tuition, students, investment, margin].forEach(function (input) {
    input.addEventListener('input', recalculate);
  });

  recalculate();
})();
