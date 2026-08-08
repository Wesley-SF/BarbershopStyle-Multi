export function sortScheduleBlocks(scheduleBlocks) {
  return [...scheduleBlocks].sort((firstBlock, secondBlock) => {
    const dateDifference = firstBlock.block_date.localeCompare(secondBlock.block_date);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    if (firstBlock.all_day !== secondBlock.all_day) {
      return firstBlock.all_day ? -1 : 1;
    }

    return String(firstBlock.start_time ?? "").localeCompare(
      String(secondBlock.start_time ?? ""),
    );
  });
}

export function hasAllDayScheduleBlock(scheduleBlocks) {
  return scheduleBlocks.some((scheduleBlock) => scheduleBlock.all_day === true);
}

