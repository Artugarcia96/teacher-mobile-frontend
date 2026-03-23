import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const hapticLight = () => {
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
};

export const hapticMedium = () => {
  Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
};

export const hapticSuccess = () => {
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
};

export const hapticWarning = () => {
  Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
};

export const hapticError = () => {
  Haptics.notification({ type: NotificationType.Error }).catch(() => {});
};
