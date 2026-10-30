// Phosphor Icons (MIT), imported one by one as inline SVG: no icon font (DESIGN-SYSTEM 10).
import drop from "@phosphor-icons/core/assets/regular/drop.svg?raw";
import arrowRight from "@phosphor-icons/core/assets/regular/arrow-right.svg?raw";
import arrowLeft from "@phosphor-icons/core/assets/regular/arrow-left.svg?raw";
import magnifyingGlass from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import bell from "@phosphor-icons/core/assets/regular/bell.svg?raw";
import dotsThree from "@phosphor-icons/core/assets/regular/dots-three.svg?raw";
import check from "@phosphor-icons/core/assets/regular/check.svg?raw";
import phone from "@phosphor-icons/core/assets/regular/phone.svg?raw";
import cloudSlash from "@phosphor-icons/core/assets/regular/cloud-slash.svg?raw";
import warning from "@phosphor-icons/core/assets/regular/warning.svg?raw";
import speakerHigh from "@phosphor-icons/core/assets/regular/speaker-high.svg?raw";
import microphone from "@phosphor-icons/core/assets/regular/microphone.svg?raw";
import camera from "@phosphor-icons/core/assets/regular/camera.svg?raw";
import trash from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import arrowCounterClockwise from "@phosphor-icons/core/assets/regular/arrow-counter-clockwise.svg?raw";
import videoCamera from "@phosphor-icons/core/assets/regular/video-camera.svg?raw";
import videoCameraSlash from "@phosphor-icons/core/assets/regular/video-camera-slash.svg?raw";
import microphoneSlash from "@phosphor-icons/core/assets/regular/microphone-slash.svg?raw";
import phoneDisconnect from "@phosphor-icons/core/assets/regular/phone-disconnect.svg?raw";
import cellSignalHigh from "@phosphor-icons/core/assets/regular/cell-signal-high.svg?raw";
import house from "@phosphor-icons/core/assets/regular/house.svg?raw";
import users from "@phosphor-icons/core/assets/regular/users.svg?raw";
import calendarBlank from "@phosphor-icons/core/assets/regular/calendar-blank.svg?raw";
import chatCircleText from "@phosphor-icons/core/assets/regular/chat-circle-text.svg?raw";
import user from "@phosphor-icons/core/assets/regular/user.svg?raw";
import siren from "@phosphor-icons/core/assets/regular/siren.svg?raw";
import phoneCall from "@phosphor-icons/core/assets/regular/phone-call.svg?raw";
import chatText from "@phosphor-icons/core/assets/regular/chat-text.svg?raw";
import pill from "@phosphor-icons/core/assets/regular/pill.svg?raw";
import thermometer from "@phosphor-icons/core/assets/regular/thermometer.svg?raw";
import scales from "@phosphor-icons/core/assets/regular/scales.svg?raw";
import ruler from "@phosphor-icons/core/assets/regular/ruler.svg?raw";
import lock from "@phosphor-icons/core/assets/regular/lock.svg?raw";
import eye from "@phosphor-icons/core/assets/regular/eye.svg?raw";
import eyeSlash from "@phosphor-icons/core/assets/regular/eye-slash.svg?raw";
import checkCircle from "@phosphor-icons/core/assets/regular/check-circle.svg?raw";
import x from "@phosphor-icons/core/assets/regular/x.svg?raw";
import caretRight from "@phosphor-icons/core/assets/regular/caret-right.svg?raw";
import qrCode from "@phosphor-icons/core/assets/regular/qr-code.svg?raw";
import translate from "@phosphor-icons/core/assets/regular/translate.svg?raw";
import clock from "@phosphor-icons/core/assets/regular/clock.svg?raw";
import fileText from "@phosphor-icons/core/assets/regular/file-text.svg?raw";
import stop from "@phosphor-icons/core/assets/regular/stop.svg?raw";
import wifiSlash from "@phosphor-icons/core/assets/regular/wifi-slash.svg?raw";
import babyDuo from "@phosphor-icons/core/assets/duotone/baby-duotone.svg?raw";
import pillDuo from "@phosphor-icons/core/assets/duotone/pill-duotone.svg?raw";
import calendarCheckDuo from "@phosphor-icons/core/assets/duotone/calendar-check-duotone.svg?raw";
import usersDuo from "@phosphor-icons/core/assets/duotone/users-duotone.svg?raw";
import chatCircleTextDuo from "@phosphor-icons/core/assets/duotone/chat-circle-text-duotone.svg?raw";

const regular = {
  "drop": drop,
  "arrow-right": arrowRight,
  "arrow-left": arrowLeft,
  "magnifying-glass": magnifyingGlass,
  "bell": bell,
  "dots-three": dotsThree,
  "check": check,
  "phone": phone,
  "cloud-slash": cloudSlash,
  "warning": warning,
  "speaker-high": speakerHigh,
  "microphone": microphone,
  "camera": camera,
  "trash": trash,
  "arrow-counter-clockwise": arrowCounterClockwise,
  "video-camera": videoCamera,
  "video-camera-slash": videoCameraSlash,
  "microphone-slash": microphoneSlash,
  "phone-disconnect": phoneDisconnect,
  "cell-signal-high": cellSignalHigh,
  "house": house,
  "users": users,
  "calendar-blank": calendarBlank,
  "chat-circle-text": chatCircleText,
  "user": user,
  "siren": siren,
  "phone-call": phoneCall,
  "chat-text": chatText,
  "pill": pill,
  "thermometer": thermometer,
  "scales": scales,
  "ruler": ruler,
  "lock": lock,
  "eye": eye,
  "eye-slash": eyeSlash,
  "check-circle": checkCircle,
  "x": x,
  "caret-right": caretRight,
  "qr-code": qrCode,
  "translate": translate,
  "clock": clock,
  "file-text": fileText,
  "stop": stop,
  "wifi-slash": wifiSlash,
} as const;
const duotone = {
  "baby": babyDuo,
  "pill": pillDuo,
  "calendar-check": calendarCheckDuo,
  "users": usersDuo,
  "chat-circle-text": chatCircleTextDuo,
} as const;

export type IconName = keyof typeof regular;
export type DuotoneName = keyof typeof duotone;

type IconProps = { name: IconName; size?: "md" | "sm"; label?: string };

/** Decorative by default; pass `label` only when the icon stands alone. */
export function Icon({ name, size = "md", label }: IconProps) {
  return (
    <span
      className={`icon icon-${size}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: regular[name] }}
    />
  );
}

/** Category-tile icon: violet outline, lavender fill. */
export function DuotoneIcon({ name }: { name: DuotoneName }) {
  return <span className="icon icon-tile icon-duo" aria-hidden dangerouslySetInnerHTML={{ __html: duotone[name] }} />;
}
