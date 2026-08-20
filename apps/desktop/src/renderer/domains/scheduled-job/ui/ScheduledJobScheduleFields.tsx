import { Autocomplete, InputAdornment, MenuItem, TextField, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { LuClock3, LuGlobe } from "react-icons/lu";
import type { ScheduledJobFormDraft } from "../hooks/useScheduledJobFormState";
import type { ScheduleType } from "../schedule/scheduledJobScheduleRules";
import { VirtualizedListbox } from "./VirtualizedListbox";

/** IANA timezone names supported by the current JS runtime. */
export const TIMEZONE_OPTIONS: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; labelKey: string }[] = [
  { value: "daily", labelKey: "scheduledJob.form.scheduleTypes.daily" },
  { value: "weekly", labelKey: "scheduledJob.form.scheduleTypes.weekly" },
  { value: "weekday", labelKey: "scheduledJob.form.scheduleTypes.weekday" },
  { value: "hourly", labelKey: "scheduledJob.form.scheduleTypes.hourly" },
  { value: "custom", labelKey: "scheduledJob.form.scheduleTypes.custom" },
];

export const WEEKDAY_OPTIONS = [
  { value: "1", labelKey: "scheduledJob.form.weekdays.monday" },
  { value: "2", labelKey: "scheduledJob.form.weekdays.tuesday" },
  { value: "3", labelKey: "scheduledJob.form.weekdays.wednesday" },
  { value: "4", labelKey: "scheduledJob.form.weekdays.thursday" },
  { value: "5", labelKey: "scheduledJob.form.weekdays.friday" },
  { value: "6", labelKey: "scheduledJob.form.weekdays.saturday" },
  { value: "0", labelKey: "scheduledJob.form.weekdays.sunday" },
];

const nextRunEstimateSx = { display: "block", mt: 0.75 };
const timeInputProps = { inputMode: "numeric", pattern: "[0-2][0-9]:[0-5][0-9]" };
const timezoneInputStyle = { marginLeft: 8 };
const nextRunTimeFormat: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

interface ScheduledJobScheduleFieldsProps {
  draft: ScheduledJobFormDraft;
  setDraft: Dispatch<SetStateAction<ScheduledJobFormDraft>>;
  scheduleType: ScheduleType;
  setScheduleType: Dispatch<SetStateAction<ScheduleType>>;
  weeklyDay: string;
  setWeeklyDay: Dispatch<SetStateAction<string>>;
  scheduleTime: string;
  setScheduleTime: Dispatch<SetStateAction<string>>;
  isBusy: boolean;
  cronDescription: string;
  nextRunEstimate: Date | null;
  customCronDescriptionSx?: SxProps<Theme>;
}

function ScheduledJobScheduleFields({
  draft,
  setDraft,
  scheduleType,
  setScheduleType,
  weeklyDay,
  setWeeklyDay,
  scheduleTime,
  setScheduleTime,
  isBusy,
  cronDescription,
  nextRunEstimate,
  customCronDescriptionSx,
}: ScheduledJobScheduleFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <TextField
        select
        fullWidth
        disabled={isBusy}
        value={scheduleType}
        onChange={(event) => setScheduleType(event.target.value as ScheduleType)}
      >
        {SCHEDULE_TYPE_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {t(option.labelKey)}
          </MenuItem>
        ))}
      </TextField>
      {scheduleType === "weekly" ? (
        <TextField
          select
          fullWidth
          disabled={isBusy}
          value={weeklyDay}
          onChange={(event) => setWeeklyDay(event.target.value)}
        >
          {WEEKDAY_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
      {scheduleType !== "custom" ? (
        <TextField
          fullWidth
          disabled={isBusy}
          type="text"
          value={scheduleTime}
          onChange={(event) => setScheduleTime(event.target.value)}
          placeholder="09:00"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <LuClock3 size={16} />
                </InputAdornment>
              ),
            },
            htmlInput: timeInputProps,
          }}
        />
      ) : null}
      {scheduleType === "custom" ? (
        <TextField
          fullWidth
          disabled={isBusy}
          value={draft.cronExpression}
          onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, cronExpression: event.target.value }))}
          placeholder={t("scheduledJob.form.cronExpressionPlaceholder")}
        />
      ) : null}
      {scheduleType === "custom" ? (
        <Typography
          variant="caption"
          sx={[
            { color: "text.secondary" },
            ...(Array.isArray(customCronDescriptionSx) ? customCronDescriptionSx : [customCronDescriptionSx]),
          ]}
        >
          {cronDescription}
        </Typography>
      ) : null}
      <Autocomplete
        options={TIMEZONE_OPTIONS}
        value={draft.timezone}
        onChange={(_, value) => setDraft((previousDraft) => ({ ...previousDraft, timezone: value ?? "UTC" }))}
        disabled={isBusy}
        size="small"
        autoHighlight
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder="UTC"
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps.input,
                startAdornment: (
                  <>
                    <InputAdornment position="start">
                      <LuGlobe size={16} style={timezoneInputStyle} />
                    </InputAdornment>
                    {params.slotProps.input.startAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        slotProps={{ listbox: { component: VirtualizedListbox } }}
      />
      <Typography variant="caption" sx={[{ color: "text.secondary" }, nextRunEstimateSx]}>
        {nextRunEstimate
          ? t("scheduledJob.form.nextRunEstimate", {
              value: nextRunEstimate.toLocaleString(undefined, {
                ...nextRunTimeFormat,
                timeZone: draft.timezone || "UTC",
              }),
            })
          : t("scheduledJob.form.nextRunEstimateUnavailable")}
      </Typography>
    </>
  );
}

export { ScheduledJobScheduleFields };
