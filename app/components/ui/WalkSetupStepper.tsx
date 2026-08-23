type WalkSetupStepperProps = {
  step: 1 | 2;
};

export function WalkSetupStepper({ step }: WalkSetupStepperProps) {
  return (
    <div className="walk-setup-stepper" role="status" aria-label={`Шаг ${step} из 2`}>
      <span className="walk-setup-progress" aria-hidden="true">
        <span className="complete" />
        <span className={step === 2 ? "complete walk-setup-progress-animated" : ""} />
      </span>
      <span className="walk-setup-step-label">Шаг {step} из 2</span>
    </div>
  );
}
